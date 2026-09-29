# Private extraction benchmark

The example manifest contains fictional values and an intentionally nonexistent image path. It is not an accuracy dataset. No real document image belongs in this repository.

Keep consented images and ground truth outside the repository. Use JPEG/PNG pages already processed by the client deskew step. Copy the manifest outside the repository, supply paths relative to that manifest, and annotate all ten fields; use null for absent/unreadable values. Have a second reviewer check annotations. Include Vietnamese diacritics, handwriting, missing fields, camera skew, glare and blur. Report source category and sample size with any scores.

Run the local application with real OCR/Gemini credentials, then explicitly opt in to paid calls:

```sh
npx tsx scripts/evaluate-document-extraction.ts /private/dataset/samples.json http://localhost:3000 --live
```

The harness prints aggregates, never document values. Exact and normalized matches include null fields; also inspect missing-field rate (denominator: expected non-null fields) and false-value rate (denominator: returned non-null values). False-value is a measurable proxy that includes extraction/OCR mistakes, not proof that every mistake originated in Gemini. Unannotated returned fields count against ground truth null. Inspect incorrect automatic acceptances separately.

This harness measures the server pipeline on preprocessed images. Browser quality-gate/deskew acceptance, OCR character/word error rates, and human-review outcomes require separate labeled evaluations. No real-data benchmark has been run as part of creating this harness.
