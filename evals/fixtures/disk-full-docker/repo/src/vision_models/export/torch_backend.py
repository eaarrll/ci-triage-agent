from __future__ import annotations

import torch

from .preprocess import decode, to_tensor


class TorchBackend:
    name = "torch"

    def __init__(self, model: dict, runtime: dict) -> None:
        self._device = torch.device(runtime.get("device", "cuda"))
        self._model = torch.jit.load(model["weights"], map_location=self._device).eval()
        self._size = tuple(model["input_size"])
        self._threshold = model.get("score_threshold", 0.25)

    @torch.inference_mode()
    def detect(self, image_bytes: bytes) -> list[dict]:
        tensor = torch.from_numpy(to_tensor(decode(image_bytes), self._size)).to(self._device)
        boxes, scores, labels = self._model(tensor)
        keep = scores[0] >= self._threshold
        return [
            {"box": b.tolist(), "score": float(s), "label": int(l)}
            for b, s, l in zip(boxes[0][keep], scores[0][keep], labels[0][keep], strict=True)
        ]
