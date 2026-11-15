import datetime as dt

from garmin_core.errors import InvalidWorkout

from sync import connectors, oauth, strava, withings
from sync.outbox import Runner

UTC = dt.timezone.utc
T0 = dt.datetime(2026, 11, 15, 7, 0, tzinfo=UTC)


def test_strava_rows_link_to_the_garmin_activity_that_started_closest():
    rows = [strava.normalize({"id": 9, "name": "Morning Run", "sport_type": "Run", "start_date": "2026-11-15T07:01:00Z", "distance": 5000.0, "elapsed_time": 1500})]
    strava.link(rows, [("g1", T0), ("g2", T0 + dt.timedelta(seconds=50)), ("g3", T0 + dt.timedelta(hours=2))])
    assert rows[0]["strava_id"] == "9" and rows[0]["garmin_activity_id"] == "g2"
    far = [strava.normalize({"id": 1, "start_date": "2026-11-15T12:00:00Z"})]
    strava.link(far, [("g1", T0)])
    assert far[0]["garmin_activity_id"] is None
    assert strava.normalize({"name": "no id"}) is None


def test_withings_keeps_the_latest_weigh_in_of_each_local_day():
    groups = [
        {"date": int(dt.datetime(2026, 11, 14, 23, 30, tzinfo=UTC).timestamp()), "measures": [{"type": 1, "value": 80250, "unit": -3}, {"type": 6, "value": 182, "unit": -1}]},
        {"date": int(dt.datetime(2026, 11, 15, 6, 0, tzinfo=UTC).timestamp()), "measures": [{"type": 1, "value": 7990, "unit": -2}]},
        {"date": int(dt.datetime(2026, 11, 13, 6, 0, tzinfo=UTC).timestamp()), "measures": [{"type": 6, "value": 18, "unit": 0}]},
    ]
    pts = withings.weigh_ins(groups, "Europe/Warsaw")
    # 23:30 UTC on the 14th is already the 15th in Warsaw; the later weigh-in of the 15th wins; no weight, no point.
    assert [(p["day"], p["weight_kg"]) for p in pts] == [("2026-11-15", 79.9)]
    assert withings.weigh_ins(groups[:1], "UTC")[0]["raw"]["fat_pct"] == 18.2


def test_oauth_answers_of_both_providers():
    s = oauth._tokens("strava", {"access_token": "a", "refresh_token": "r", "expires_at": 100, "athlete": {"firstname": "P", "lastname": "L"}}, 0)
    assert s == {"access_token": "a", "refresh_token": "r", "expires_at": 100.0, "account": "P L"}
    w = oauth._tokens("withings", {"status": 0, "body": {"access_token": "a", "refresh_token": "r", "expires_in": 10800, "userid": 7}}, 1000)
    assert w["expires_at"] == 11800 and w["account"] == "7"
    try:
        oauth._tokens("withings", {"status": 503}, 0)
        raise AssertionError("should fail")
    except oauth.http.HttpError:
        pass
    url = oauth.authorize_url("strava", "123", "https://nas/health/oauth", "st")
    assert "activity%3Awrite" in url and "state=st" in url and "redirect_uri=https%3A%2F%2Fnas%2Fhealth%2Foauth" in url


class FakeStore:
    def __init__(self):
        self.pushed_rows, self.queued, self.cursors, self.weights, self.edits, self.options = {}, [], {}, [], [], {}
        self.garmin_days = {}

    def pushed(self, p, ref): return self.pushed_rows.get(ref)
    def set_pushed(self, p, ref, row): self.pushed_rows[ref] = row
    def drop_pushed(self, p, ref): self.pushed_rows.pop(ref, None)
    def strava_edited(self, *a): self.edits.append(("strava", *a[1:]))
    def garmin_edited(self, *a): self.edits.append(("garmin", *a[1:]))
    def cursor(self, p, s): return dict(self.cursors.get(s, {}))
    def set_cursor(self, p, s, c): self.cursors[s] = c
    def put_weights(self, p, s, pts): self.weights += pts
    def option(self, p, k, default=None): return self.options.get(k, default)
    def garmin_weight_days(self, p, days): return {d: v for d, v in self.garmin_days.items() if d in days}
    def queue(self, p, target, op, payload, by="service"): self.queued.append((target, op, payload))


class FakeGarmin:
    def __init__(self, supported=True):
        self.calls, self.supported = [], supported

    def create_workout(self, p, sport, title, steps, note=None):
        self.calls.append(("create", title))
        if title == "bad":
            raise InvalidWorkout("unknown step kind 'x'")
        return {"supported": True, "workoutId": f"w{len(self.calls)}"} if self.supported else {"supported": False, "reason": "unsupported_sport"}

    def schedule_workout(self, p, wid, day):
        self.calls.append(("schedule", wid, day.isoformat()))
        return {"supported": True, "scheduleId": "s1"}

    def delete_workout(self, p, wid):
        self.calls.append(("delete", wid))
        return {"supported": True, "removed": True}


class FakeStrava:
    def edit(self, sid, title, description): return {"name": title, "description": description}


def item(target, op, **payload):
    return {"id": "x", "profile": "piotr", "target": target, "op": op, "payload": payload}


WORKOUT = dict(ref="training:s1", sport="running", title="5x100 m strides", day="2026-11-20", steps=[{"kind": "warmup", "durationType": "time", "durationValue": 600}])


def test_sending_a_workout_again_replaces_the_old_one_on_garmin():
    store, garmin = FakeStore(), FakeGarmin()
    r = Runner(store, garmin, lambda p: FakeStrava())
    assert r.run(item("garmin", "send_workout", **WORKOUT))[0] == "done"
    state, result, _ = r.run(item("garmin", "send_workout", **{**WORKOUT, "day": "2026-11-21"}))
    assert state == "done" and result["workoutId"] == "w4"
    assert garmin.calls == [("create", "5x100 m strides"), ("schedule", "w1", "2026-11-20"), ("delete", "w1"), ("create", "5x100 m strides"), ("schedule", "w4", "2026-11-21")]
    assert store.pushed_rows["training:s1"]["day"] == "2026-11-21"
    assert r.run(item("garmin", "remove_workout", ref="training:s1"))[0] == "done"
    assert garmin.calls[-1] == ("delete", "w4") and "training:s1" not in store.pushed_rows


def test_writes_say_honestly_what_did_not_happen():
    r = Runner(FakeStore(), FakeGarmin(supported=False), lambda p: FakeStrava())
    assert r.run(item("garmin", "send_workout", **WORKOUT))[0] == "unsupported"
    r = Runner(FakeStore(), FakeGarmin(), lambda p: FakeStrava())
    assert r.run(item("garmin", "send_workout", **{**WORKOUT, "title": "bad"}))[:1] == ("failed",)
    assert r.run(item("garmin", "send_workout", ref="a"))[2].startswith("missing sport")
    assert r.run(item("garmin", "fly"))[2] == "unknown write garmin.fly"
    assert r.run(item("garmin", "add_weight", kg=5, at="2026-11-15T07:00:00Z"))[2] == "kg must be 20-400"


def test_a_strava_edit_is_kept_locally_too():
    store = FakeStore()
    r = Runner(store, FakeGarmin(), lambda p: FakeStrava())
    assert r.run(item("strava", "edit_activity", strava_id="9", title="5x100 m strides"))[0] == "done"
    assert store.edits == [("strava", "9", "5x100 m strides", None)]


class FakeWithings:
    def __init__(self, groups): self._g = groups
    def groups(self, since): return self._g


def test_withings_weigh_ins_go_to_garmin_only_when_switched_on_and_only_new_ones():
    g = [
        {"date": int((T0 - dt.timedelta(days=3)).timestamp()), "measures": [{"type": 1, "value": 81000, "unit": -3}]},
        {"date": int(T0.timestamp()), "measures": [{"type": 1, "value": 80000, "unit": -3}]},
    ]
    store = FakeStore()
    connectors.sync_withings(store, FakeWithings(g), "piotr", T0, "UTC")
    assert len(store.weights) == 2 and store.queued == []
    store.options["withings_to_garmin"] = {"on": True, "since": (T0 - dt.timedelta(days=1)).isoformat()}
    out = connectors.sync_withings(store, FakeWithings(g), "piotr", T0, "UTC")
    assert out["to_garmin"] == 1 and store.queued[0][:2] == ("garmin", "add_weight") and store.queued[0][2]["kg"] == 80.0
    again = connectors.sync_withings(store, FakeWithings(g), "piotr", T0, "UTC")
    assert again["to_garmin"] == 0


def test_garmin_write_bodies():
    from sync import garmin_writes as gw

    b = gw.weight_body(80.04, dt.datetime(2026, 11, 15, 6, 30, tzinfo=UTC), "Europe/Warsaw")
    assert b == {"dateTimestamp": "2026-11-15T07:30:00.00", "gmtTimestamp": "2026-11-15T06:30:00.00", "unitKey": "kg", "sourceType": "MANUAL", "value": 80.04}
    assert gw.activity_body("123", "Strides", None) == {"activityId": 123, "activityName": "Strides"}
