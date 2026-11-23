from __future__ import annotations

from typing import Any, Protocol


class Backend(Protocol):
    name: str

    def detect(self, image_bytes: bytes) -> list[dict[str, Any]]: ...


def load_backend(model: dict, runtime: dict) -> Backend:
    kind = runtime.get("backend", "torch")
    if kind == "torch":
        from .torch_backend import TorchBackend

        return TorchBackend(model, runtime)
    if kind == "onnx":
        from .onnx import OnnxBackend

        return OnnxBackend(model, runtime)
    if kind == "tensorrt":
        from .tensorrt import TensorRTBackend

        return TensorRTBackend(model, runtime)
    raise ValueError(f"unknown backend {kind!r}")
