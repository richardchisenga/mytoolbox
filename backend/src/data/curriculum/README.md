# MyToolbox Curriculum Knowledge Base

MyToolbox is designed as a multi-subject, multi-level curriculum engine. It does **not** treat Biology as the curriculum for every teacher.

## Source hierarchy

1. Imported official Zambia Ministry of Education / Curriculum Development Centre syllabus or Teaching Module.
2. A clearly labelled local teacher-supplied index, where applicable.
3. No local source: DeepSeek may write a useful lesson/scheme, but the system must not claim that generated topic codes, page numbers, textbook titles or references are official CDC material.

## Pack format

Use `CURRICULUM_PACK_TEMPLATE.json` as the structure for adding a verified subject/grade/term pack.

Each pack is discovered recursively under this directory. Recommended future layout:

```text
curriculum/
  cbc/
    primary/
      mathematics/
      english/
    secondary/
      form1/
        mathematics/
        biology/
        chemistry/
  obc/
    ...
```

The loader currently accepts JSON packs anywhere below this directory, so deployment can add packs without changing generator code.

## Verification status

- `VERIFIED_LOCAL_PACK_MATCH` = a local curriculum row matched the selected subject, grade/form, term and topic/subtopic.
- `LOCAL_PACK_NO_TOPIC_MATCH` = a local pack exists, but the requested topic did not match.
- `SOURCE_NOT_FOUND` = no local curriculum pack exists for that selection.
- `OBC_MODE` = legacy syllabus mode selected.

The subject catalog is a selection catalog based on the Zambia Ministry of Education Directorate of Curriculum Development listing. A catalog entry is **not** treated as a verified local syllabus until its source pack is imported.

Official catalog:
https://www.edu.gov.zm/?page_id=1142


## Official subject registry
The `registry/official_secondary_syllabus_registry.json` registers the Ministry DCD syllabus source for the secondary subjects listed on the official Directorate page. This does not claim detailed topic-level verification until a local indexed pack with rows is imported.
