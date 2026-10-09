import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import torch
from torch import nn
from vietocr.model.seqmodel.transformer import LanguageTransformer
from vietocr.tool.translate import translate as upstream_translate

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from decoding import CachedDecoder, supports_cached_decoder, translate
from model_optimization import fuse_cnn_batch_norm


class DecodingTests(unittest.TestCase):
    def language(self, norm_first=False):
        torch.manual_seed(101)
        language = LanguageTransformer(13, 16, 2, 1, 2, 32, 24, 0, 0).eval()
        if norm_first:
            language.transformer.decoder = nn.TransformerDecoder(
                nn.TransformerDecoderLayer(16, 2, 32, dropout=0, norm_first=True), 2, nn.LayerNorm(16)).eval()
        return language

    def test_incremental_logits_match_full_causal_prefix_for_both_norm_orders(self):
        with torch.inference_mode():
            for norm_first in (False, True):
                language = self.language(norm_first)
                memory = torch.randn(9, 2, 16)
                tokens = torch.randint(0, 13, (10, 2))
                cached = CachedDecoder(language, memory, 10)
                for position in range(10):
                    expected, _ = language.forward_decoder(tokens[:position+1], memory)
                    actual = cached.step(tokens[position:position+1], position)
                    torch.testing.assert_close(actual[:, -1], expected[:, -1], rtol=2e-5, atol=2e-6)

    def test_cached_greedy_matches_upstream_tokens_confidence_and_length_limit(self):
        language = self.language()
        class Model(nn.Module):
            def __init__(self):
                super().__init__()
                self.transformer = language
                self.cnn = nn.Identity()
        model = Model().eval()
        image = torch.randn(2, 2, 16)
        expected, probabilities = upstream_translate(image, model, max_seq_length=8)
        actual, scores = translate(image, model, max_seq_length=8)
        np.testing.assert_array_equal(actual, expected)
        np.testing.assert_allclose(scores, probabilities, rtol=1e-5, atol=1e-6)
        self.assertLessEqual(actual.shape[1], 10)

    def test_unsupported_model_uses_original_decoder(self):
        self.assertFalse(supports_cached_decoder(SimpleNamespace(transformer=SimpleNamespace())))
        model = nn.Linear(2, 2).eval()
        image = torch.randn(1, 2)
        with patch('decoding.upstream_translate', return_value=('tokens', 'probabilities')) as original:
            self.assertEqual(translate(image, model, max_seq_length=8), ('tokens', 'probabilities'))
            original.assert_called_once_with(image, model, 8, 1, 2)

    def test_eos_only_output_has_unknown_confidence_without_extra_tokens(self):
        language = self.language()
        with torch.no_grad():
            language.fc.weight.zero_()
            language.fc.bias.zero_()
            language.fc.bias[2] = 10
        class Model(nn.Module):
            def __init__(self):
                super().__init__()
                self.transformer = language
                self.cnn = nn.Identity()
        actual, scores = translate(torch.randn(2, 2, 16), Model().eval(), max_seq_length=8)
        np.testing.assert_array_equal(actual, [[1, 2], [1, 2]])
        self.assertTrue(np.isnan(scores).all())

    def test_cache_is_independent_between_batches(self):
        with torch.inference_mode():
            language = self.language()
            memory = torch.randn(7, 2, 16)
            first = CachedDecoder(language, memory, 2)
            other = CachedDecoder(language, memory+1, 2)
            token = torch.ones(1, 2, dtype=torch.long)
            expected = first.step(token, 0).clone()
            other.step(token, 0)
            torch.testing.assert_close(first.step(token, 0), expected)

    def test_cnn_fusion_preserves_eval_output_and_is_idempotent(self):
        torch.manual_seed(99)
        cnn = nn.Sequential(nn.Conv2d(3, 8, 3, padding=1), nn.BatchNorm2d(8), nn.ReLU(),
                            nn.Conv2d(8, 4, 3, padding=1), nn.BatchNorm2d(4)).eval()
        model = nn.Module()
        model.cnn = cnn
        model.eval()
        image = torch.randn(2, 3, 32, 70)
        with torch.inference_mode():
            expected = cnn(image)
            self.assertEqual(fuse_cnn_batch_norm(model), 2)
            torch.testing.assert_close(cnn(image), expected, rtol=2e-5, atol=2e-6)
            self.assertEqual(fuse_cnn_batch_norm(model), 0)
        model.train()
        with self.assertRaises(ValueError): fuse_cnn_batch_norm(model)


if __name__ == '__main__':
    unittest.main()
