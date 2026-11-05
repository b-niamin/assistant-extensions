import datetime as dt

from garmin_core.errors import GarminUpstreamError

from sync.engine import Engine

TODAY = dt.date(2026, 11, 3)


class FakeStore:
    def __init__(self):
        self.metric_days, self.activities, self.streams, self.runs, self.cursor = [], {}, {}, [], {}

    def put_metric_days(self, p, m, days): self.metric_days += [(m, d["day"], d["has_value"]) for d in days]
    def put_activities(self, p, rows): self.activities.update({r["activity_id"]: r for r in rows})
    def known_activity_ids(self, p): return set(self.activities)
    def activities_missing_streams(self, p, v, limit):
        return [{"activity_id": a, "has_gps": r["has_gps"]} for a, r in self.activities.items() if a not in self.streams][:limit]
    def put_streams(self, p, a, s, gps): self.streams[a] = s
    def put_weight(self, p, pts): pass
    def replace_planned(self, *a): pass
    def get_cursor(self, p): return dict(self.cursor)
    def set_cursor(self, p, c, full=False): self.cursor = dict(c)
    def start_run(self, p, k): self.runs.append([k, None]); return len(self.runs) - 1
    def finish_run(self, i, status, detail, error=None): self.runs[i][1] = status


class FakeGarmin:
    def __init__(self, fail_metrics=None):
        self.fail_metrics = fail_metrics

    def get_metric_range(self, p, name, start, end):
        if self.fail_metrics:
            raise self.fail_metrics
        n = (end - start).days + 1
        return {"days": [{"date": (start + dt.timedelta(days=i)).isoformat(), "data": {"value": 1}} for i in range(n)]}

    def list_activities(self, p, limit, start):
        if start:
            return []
        return [{"activityId": 1, "activityType": {"typeKey": "running"}, "averageHR": 140, "startTimeGMT": "2026-11-01 06:00:00"}]

    def get_activity_details(self, p, aid): return {"heartRate": [120, 130]}
    def get_weight_range(self, p, s, e): return {"data": []}
    def get_planned_events(self, p, s, e): return {"available": False, "events": []}


def test_incremental_pass_writes_every_phase():
    store = FakeStore()
    res = Engine(FakeGarmin(), store, today=TODAY).run("alex")
    assert res["status"] == "ok"
    assert res["activities"] == 1 and res["streams"] == 1
    assert len({d for _, d, _ in store.metric_days}) == 7
    assert store.cursor["lastRun"] == "2026-11-03"


def test_rate_limit_aborts_the_pass():
    store = FakeStore()
    err = GarminUpstreamError("rate_limited", reason="HTTP 429")
    res = Engine(FakeGarmin(fail_metrics=err), store, today=TODAY).run("alex")
    assert res["status"] == "failed" and store.runs[0][1] == "failed"


def test_backfill_walks_back_and_saves_frontier():
    store = FakeStore()
    eng = Engine(FakeGarmin(), store, today=TODAY)
    out = eng.backfill_metrics("alex", since=TODAY - dt.timedelta(days=70))
    assert out["chunks"] == 3 and store.cursor["metricsBackfilledTo"] == "2026-08-25"
    assert store.cursor["metricsComplete"] is True
