"""Greedy VietOCR decoding with request-local attention caches and original weights."""
import math

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from vietocr.tool.translate import translate as upstream_translate


def supports_cached_decoder(model):
    language = getattr(model, 'transformer', None)
    transformer = getattr(language, 'transformer', None)
    decoder = getattr(transformer, 'decoder', None)
    if not isinstance(decoder, nn.TransformerDecoder):
        return False
    if not all(hasattr(language, name) for name in ('embed_tgt', 'pos_enc', 'd_model', 'fc')):
        return False
    if not hasattr(language.pos_enc, 'pe') or model.training:
        return False
    return all(isinstance(layer, nn.TransformerDecoderLayer) and all(
        isinstance(attention, nn.MultiheadAttention) and not attention.batch_first
        and attention._qkv_same_embed_dim and attention.bias_k is None
        and attention.bias_v is None and not attention.add_zero_attn
        for attention in (layer.self_attn, layer.multihead_attn)) for layer in decoder.layers)


def _heads(value, attention):
    length, batch, width = value.shape
    return value.reshape(length, batch, attention.num_heads, width // attention.num_heads).permute(1, 2, 0, 3)


def _attend(query, keys, values, attention):
    output = F.scaled_dot_product_attention(query, keys, values, dropout_p=0.0)
    batch, _, length, _ = output.shape
    output = output.transpose(1, 2).reshape(batch, length, attention.embed_dim).transpose(0, 1)
    return F.linear(output, attention.out_proj.weight, attention.out_proj.bias)


class CachedDecoder:
    """One batch only. Cached prefixes are causal; no cache survives a request."""
    def __init__(self, language, memory, max_steps):
        self.language = language
        self.states = []
        for layer in language.transformer.decoder.layers:
            cross = layer.multihead_attn
            width = cross.embed_dim
            bias = cross.in_proj_bias[width:] if cross.in_proj_bias is not None else None
            key, value = F.linear(memory, cross.in_proj_weight[width:], bias).chunk(2, dim=-1)
            shape = (memory.shape[1], layer.self_attn.num_heads, max_steps,
                     layer.self_attn.embed_dim // layer.self_attn.num_heads)
            self.states.append((_heads(key, cross), _heads(value, cross),
                                memory.new_empty(shape), memory.new_empty(shape)))

    def step(self, token, position):
        language = self.language
        value = language.embed_tgt(token) * math.sqrt(language.d_model)
        value = language.pos_enc.dropout(value + language.pos_enc.pe[position:position+1])
        for layer, (cross_key, cross_value, self_key, self_value) in zip(language.transformer.decoder.layers, self.states):
            def self_attention(value):
                attention = layer.self_attn
                query, key, val = F.linear(value, attention.in_proj_weight, attention.in_proj_bias).chunk(3, dim=-1)
                self_key[:, :, position:position+1].copy_(_heads(key, attention))
                self_value[:, :, position:position+1].copy_(_heads(val, attention))
                # Single latest query attends to every prefix position, no future keys.
                return layer.dropout1(_attend(_heads(query, attention), self_key[:, :, :position+1],
                                             self_value[:, :, :position+1], attention))

            def cross_attention(value):
                attention = layer.multihead_attn
                width = attention.embed_dim
                bias = attention.in_proj_bias[:width] if attention.in_proj_bias is not None else None
                query = F.linear(value, attention.in_proj_weight[:width], bias)
                return layer.dropout2(_attend(_heads(query, attention), cross_key, cross_value, attention))

            def feed_forward(value):
                return layer.dropout3(layer.linear2(layer.dropout(layer.activation(layer.linear1(value)))))

            if layer.norm_first:
                value = value + self_attention(layer.norm1(value))
                value = value + cross_attention(layer.norm2(value))
                value = value + feed_forward(layer.norm3(value))
            else:
                value = layer.norm1(value + self_attention(value))
                value = layer.norm2(value + cross_attention(value))
                value = layer.norm3(value + feed_forward(value))
        if language.transformer.decoder.norm is not None:
            value = language.transformer.decoder.norm(value)
        return language.fc(value).transpose(0, 1)


def translate(img, model, max_seq_length=128, sos_token=1, eos_token=2):
    """Preserve upstream greedy token/confidence semantics; avoid prefix recomputation."""
    if model.training:
        model.eval()
    if not supports_cached_decoder(model):
        return upstream_translate(img, model, max_seq_length, sos_token, eos_token)
    with torch.inference_mode():
        memory = model.transformer.forward_encoder(model.cnn(img))
        decoder = CachedDecoder(model.transformer, memory, max_seq_length+1)
        tokens = torch.full((max_seq_length+2, len(img)), sos_token, dtype=torch.long, device=img.device)
        probabilities = img.new_ones((max_seq_length+2, len(img)))
        finished = torch.zeros(len(img), dtype=torch.bool, device=img.device)
        count = 1
        for position in range(max_seq_length+1):
            logits = decoder.step(tokens[position:position+1], position)[:, -1, :]
            probability, token = logits.softmax(-1).max(-1)
            tokens[position+1] = token
            probabilities[position+1] = probability
            count += 1
            finished |= token == eos_token
            if bool(finished.all()):
                break
        sentences = tokens[:count].T.cpu().numpy()
        scores = probabilities[:count].T.cpu().numpy().astype(np.float64)
        scores *= sentences > 3
        denominator = (scores > 0).sum(-1)
        scores = np.divide(scores.sum(-1), denominator, out=np.full(len(img), np.nan), where=denominator > 0)
        return sentences, scores
