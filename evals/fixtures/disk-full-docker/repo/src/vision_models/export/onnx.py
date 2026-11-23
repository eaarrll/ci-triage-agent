from __future__ import annotations

from pathlib import Path

import onnxruntime as ort

from .preprocess import decode, to_tensor


class OnnxBackend:
    name = "onnx"

    def __init__(self, model: dict, runtime: dict) -> None:
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        if runtime.get("device") == "cpu":
            providers = ["CPUExecutionProvider"]
        self._session = ort.InferenceSession(str(Path(model["onnx"])), providers=providers)
        self._size = tuple(model["input_size"])

    def detect(self, image_bytes: bytes) -> list[dict]:
        tensor = to_tensor(decode(image_bytes), self._size)
        boxes, scores, labels = self._session.run(None, {"images": tensor})
        return [
            {"box": b.tolist(), "score": float(s), "label": int(l)}
            for b, s, l in zip(boxes[0], scores[0], labels[0], strict=True)
        ]
