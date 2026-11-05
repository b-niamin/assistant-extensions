from sync import normalize


def test_activity_row_maps_core_fields():
    raw = {
        "activityId": 123, "activityName": "Easy run", "activityType": {"typeKey": "running"},
        "startTimeLocal": "2026-11-01 07:00:00", "startTimeGMT": "2026-11-01 06:00:00",
        "distance": 10000.0, "duration": 3000.0, "averageHR": 140.4, "hasPolyline": True, "workoutId": 99,
    }
    r = normalize.activity_row(raw)
    assert r["activity_id"] == "123" and r["sport"] == "running"
    assert r["start_time"] == "2026-11-01T06:00:00+00:00"
    assert r["avg_hr"] == 140 and r["has_gps"] is True and r["garmin_workout_id"] == "99"
    assert r["raw"] is raw


def test_activity_row_rejects_garbage():
    assert normalize.activity_row(None) is None
    assert normalize.activity_row({"activityName": "no id"}) is None


def test_has_value_ignores_all_null_days():
    assert normalize.has_value(None) is False
    assert normalize.has_value({"userProfileId": 1, "calendarDate": "2026-11-01", "totalSteps": None}) is False
    assert normalize.has_value({"userProfileId": 1, "totalSteps": 8000}) is True
    assert normalize.has_value({"bodyBatteryValuesArray": [[1730000000000, 55]]}) is True


def test_weigh_ins_grams_to_kg():
    data = {"dateWeightList": [{"calendarDate": "2026-11-01", "weight": 75350.0}, {"calendarDate": "2026-11-02"}]}
    assert [(p["day"], p["weight_kg"]) for p in normalize.weigh_ins(data)] == [("2026-11-01", 75.35)]


def test_streams_keep_known_nonempty_fields():
    s = normalize.streams_from_details({"gps": [[1, 2]], "heartRate": [], "summary": {}, "power": [200]})
    assert s == {"v": normalize.STREAMS_SCHEMA_VERSION, "gps": [[1, 2]], "power": [200]}
