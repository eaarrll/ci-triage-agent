from __future__ import annotations

import cv2
import numpy as np


def decode(image_bytes: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("not a decodable image")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def to_tensor(image: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    resized = cv2.resize(image, size, interpolation=cv2.INTER_LINEAR)
    return np.ascontiguousarray(resized.transpose(2, 0, 1)[None], dtype=np.float32) / 255.0
