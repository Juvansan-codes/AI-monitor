# YOLO weights

Place trained YOLO weights here and set `YOLO_MODEL_PATH=models/yolo/ppe_best.pt`.

Expected custom classes (order matters — match your training dataset):

1. `helmet`
2. `safety_gloves`
3. `safety_shoes`
4. `safety_vest`
5. `uniform`

With `AI_MODE=production`, the backend loads `models/yolo/ppe_best.pt` for
PPE checks and uses `object_classes` from `.env` for maintenance objects
(`person`, `screwdriver`, `wrench`, `motor`, `panel`, ...).

If the weights file is missing the API returns:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "MODEL_NOT_AVAILABLE", "message": "PPE model has not been configured." }
}
```

It never silently returns fake successful results.
