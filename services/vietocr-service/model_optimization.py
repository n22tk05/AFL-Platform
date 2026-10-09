"""Evaluation-only optimizations that preserve the trained model's operations."""
from torch import nn
from torch.nn.utils.fusion import fuse_conv_bn_eval


def fuse_cnn_batch_norm(model):
    """Fold adjacent Conv/BatchNorm in CNN sequential blocks; no quantization."""
    if model.training:
        raise ValueError('BatchNorm fusion requires evaluation mode')
    count = 0
    for block in model.cnn.modules():
        if not isinstance(block, nn.Sequential):
            continue
        for index in range(len(block)-1):
            conv, norm = block[index], block[index+1]
            if isinstance(conv, nn.Conv2d) and isinstance(norm, nn.BatchNorm2d):
                block[index] = fuse_conv_bn_eval(conv, norm)
                block[index+1] = nn.Identity()
                count += 1
    return count
