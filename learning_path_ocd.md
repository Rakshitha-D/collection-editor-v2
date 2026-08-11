# Learning Path — proposed Object Category Definition (OCD)

Draft backend artifacts for the Learning Path editor (see `learning_path_plan.md` §5.1). Modeled on
the live **Course** OCD from `test.sunbirded.org`
(`object/category/definition/v1/read`, objectType `Collection`, name `Course`), whose shape is:
`objectMetadata.config` (frameworkMetadata + `sourcingSettings.collection` with `hierarchy.levelN`),
`objectMetadata.schema.properties` (metadata JSON schema), and top-level `forms`
(create / update / unitMetadata / childMetadata / search / publishchecklist / …).

Two new categories are needed: **Learning Path** (root) and **Level** (unit). Both target
`objectType: Collection`.

---

## 0. Prerequisite — create the object categories

```json
POST /api/object/category/v1/create
{ "request": { "objectCategory": { "name": "Learning Path" } } }
```
→ `obj-cat:learning-path`

```json
POST /api/object/category/v1/create
{ "request": { "objectCategory": { "name": "Level" } } }
```
→ `obj-cat:level`

---

## 1. Learning Path OCD (create payload)

```json
POST /api/object/category/definition/v1/create
{
  "request" : {
    "objectCategoryDefinition": {
      "categoryId": "obj-cat:learning-path",
      "targetObjectType": "Collection",
      "objectMetadata": {
        "config": {
          "frameworkMetadata": {
            "orgFWType": ["K-12", "TPD"],
            "targetFWType": []
          },
          "sourcingSettings": {
            "collection": {
              "maxDepth": 1,
              "objectType": "Collection",
              "primaryCategory": "Learning Path",
              "isRoot": true,
              "iconClass": "fa fa-road",
              "children": {},
              "hierarchy": {
                "level1": {
                  "name": "Level",
                  "type": "Unit",
                  "mimeType": "application/vnd.ekstep.content-collection",
                  "contentType": "Level",
                  "primaryCategory": "Level",
                  "iconClass": "fa fa-layer-group",
                  "children": {
                    "Content": ["Course"]
                  }
                }
              }
            }
          }
        },
        "schema": {
          "properties": {
            "mimeType": {
              "type": "string",
              "enum": ["application/vnd.ekstep.content-collection"]
            },
            "policy": {
              "type": "string",
              "enum": ["strict", "adaptive", "priorLearning"],
              "default": "strict"
            },
            "trackable": {
              "type": "object",
              "properties": {
                "enabled":   { "type": "string", "enum": ["Yes", "No"], "default": "Yes" },
                "autoBatch": { "type": "string", "enum": ["Yes", "No"], "default": "No" }
              },
              "default": { "enabled": "Yes", "autoBatch": "No" },
              "additionalProperties": false
            },
            "credentials": {
              "type": "object",
              "properties": {
                "enabled": { "type": "string", "enum": ["Yes", "No"], "default": "Yes" }
              },
              "default": { "enabled": "Yes" },
              "additionalProperties": false
            },
            "monitorable": {
              "type": "array",
              "items": { "type": "string", "enum": ["progress-report", "score-report"] }
            },
            "userConsent": {
              "type": "string",
              "enum": ["Yes", "No"],
              "default": "Yes"
            },
            "audience": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": ["Student", "Teacher", "Administrator", "Parent", "Other"]
              },
              "default": ["Student"]
            }
          }
        }
      },
      "forms": {
        "create": {
          "templateName": "",
          "required": [],
          "properties": [
            {
              "name": "First Section",
              "fields": [
                {
                  "code": "name",
                  "dataType": "text",
                  "description": "Name of the learning path",
                  "editable": true,
                  "inputType": "text",
                  "label": "Title",
                  "name": "Name",
                  "placeholder": "Title",
                  "renderingHints": { "class": "sb-g-col-lg-1 required" },
                  "required": true,
                  "visible": true,
                  "validations": [
                    { "type": "maxLength", "value": "120", "message": "Input is Exceeded" },
                    { "type": "required", "message": "Title is required" }
                  ]
                },
                {
                  "code": "description",
                  "dataType": "text",
                  "description": "Description of the learning path",
                  "editable": true,
                  "inputType": "textarea",
                  "label": "Description",
                  "name": "Description",
                  "placeholder": "A path from starting skill to demonstrated outcome.",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true,
                  "validations": [
                    { "type": "maxLength", "value": "256", "message": "Input is Exceeded" }
                  ]
                },
                {
                  "code": "keywords",
                  "dataType": "list",
                  "description": "Keywords for the learning path",
                  "editable": true,
                  "inputType": "keywords",
                  "label": "Keywords",
                  "name": "Keywords",
                  "placeholder": "Enter keywords",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                },
                {
                  "code": "policy",
                  "dataType": "text",
                  "description": "How learners move through the levels of this path",
                  "editable": true,
                  "inputType": "select",
                  "label": "Consumption policy",
                  "name": "Policy",
                  "placeholder": "Select…",
                  "renderingHints": { "class": "sb-g-col-lg-1 required" },
                  "required": true,
                  "visible": true,
                  "range": ["strict", "adaptive", "priorLearning"],
                  "default": "strict",
                  "validations": [
                    { "type": "required", "message": "Consumption policy is required" }
                  ]
                }
              ]
            }
          ]
        },
        "update": {
          "templateName": "",
          "required": [],
          "properties": [
            {
              "name": "Basic information",
              "fields": [
                {
                  "code": "name",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "text",
                  "label": "Title",
                  "name": "Name",
                  "placeholder": "Title",
                  "renderingHints": { "class": "sb-g-col-lg-1 required" },
                  "required": true,
                  "visible": true,
                  "validations": [
                    { "type": "maxLength", "value": "120", "message": "Input is Exceeded" },
                    { "type": "required", "message": "Title is required" }
                  ]
                },
                {
                  "code": "description",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "textarea",
                  "label": "Description",
                  "name": "Description",
                  "placeholder": "A path from starting skill to demonstrated outcome.",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                },
                {
                  "code": "appIcon",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "appIcon",
                  "label": "Icon",
                  "name": "Icon",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                }
              ]
            },
            {
              "name": "Curriculum",
              "description": "Framework-aligned categorisation.",
              "fields": [
                {
                  "code": "framework",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "framework",
                  "label": "Curriculum",
                  "name": "Framework",
                  "placeholder": "Select…",
                  "renderingHints": { "class": "sb-g-col-lg-1 required" },
                  "required": true,
                  "visible": true,
                  "depends": ["industry", "domain"]
                },
                {
                  "code": "industry",
                  "dataType": "list",
                  "editable": true,
                  "inputType": "multiSelect",
                  "label": "Industry",
                  "name": "Industry",
                  "placeholder": "Select industry",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true,
                  "sourceCategory": "industry",
                  "depends": ["domain"]
                },
                {
                  "code": "domain",
                  "dataType": "list",
                  "editable": true,
                  "inputType": "multiSelect",
                  "label": "Domain",
                  "name": "Domain",
                  "placeholder": "Select domain",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true,
                  "sourceCategory": "domain"
                }
              ]
            },
            {
              "name": "Consumption policy",
              "fields": [
                {
                  "code": "policy",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "select",
                  "label": "Consumption policy",
                  "name": "Policy",
                  "placeholder": "Select…",
                  "renderingHints": { "class": "sb-g-col-lg-1 required" },
                  "required": true,
                  "visible": true,
                  "range": ["strict", "adaptive", "priorLearning"],
                  "default": "strict"
                }
              ]
            },
            {
              "name": "Audience and licensing",
              "fields": [
                {
                  "code": "audience",
                  "dataType": "list",
                  "editable": true,
                  "inputType": "nestedselect",
                  "label": "Audience",
                  "name": "Audience",
                  "placeholder": "Select audience",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true,
                  "range": ["Student", "Teacher", "Administrator", "Parent", "Other"]
                },
                {
                  "code": "author",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "text",
                  "label": "Author",
                  "name": "Author",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                },
                {
                  "code": "copyright",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "text",
                  "label": "Copyright",
                  "name": "Copyright",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                },
                {
                  "code": "copyrightYear",
                  "dataType": "number",
                  "editable": true,
                  "inputType": "text",
                  "label": "Copyright year",
                  "name": "CopyrightYear",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                },
                {
                  "code": "license",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "select",
                  "label": "License",
                  "name": "License",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                }
              ]
            }
          ]
        },
        "unitMetadata": {
          "templateName": "",
          "required": [],
          "properties": [
            {
              "name": "Level information",
              "description": "Title and description shown to learners for this level.",
              "fields": [
                {
                  "code": "name",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "text",
                  "label": "Title",
                  "name": "Name",
                  "placeholder": "Level title",
                  "renderingHints": { "class": "sb-g-col-lg-1 required" },
                  "required": true,
                  "visible": true,
                  "validations": [
                    { "type": "maxLength", "value": "120", "message": "Input is Exceeded" },
                    { "type": "required", "message": "Title is required" }
                  ]
                },
                {
                  "code": "description",
                  "dataType": "text",
                  "editable": true,
                  "inputType": "textarea",
                  "label": "Description",
                  "name": "Description",
                  "placeholder": "What learners build in this level",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": false,
                  "visible": true
                }
              ]
            }
          ]
        },
        "childMetadata": {
          "templateName": "",
          "required": [],
          "properties": [
            {
              "name": "First Section",
              "fields": [
                {
                  "code": "name",
                  "dataType": "text",
                  "editable": false,
                  "inputType": "text",
                  "label": "Title",
                  "name": "Name",
                  "renderingHints": { "class": "sb-g-col-lg-1" },
                  "required": true,
                  "visible": true
                }
              ]
            }
          ]
        },
        "search": {
          "templateName": "",
          "required": [],
          "properties": [
            {
              "code": "status",
              "dataType": "list",
              "editable": true,
              "inputType": "nestedselect",
              "label": "Status",
              "name": "Status",
              "visible": true,
              "range": ["Draft", "Review", "Live"]
            }
          ]
        },
        "publishchecklist": {
          "templateName": "",
          "required": [],
          "properties": [
            {
              "name": "Publish checklist",
              "fields": [
                {
                  "code": "checklist",
                  "dataType": "list",
                  "inputType": "checkbox",
                  "label": "Learning path review checklist",
                  "name": "Checklist",
                  "visible": true,
                  "range": [
                    "Prior assessment is a question-set-only course (when policy requires it)",
                    "Outcome assessment is a question-set-only course",
                    "Every level has at least one course and at least one skill",
                    "Level skills are within the prior assessment's skill scope",
                    "All linked courses carry skill tags",
                    "No duplicate courses across the path",
                    "Consumption policy is appropriate for the audience"
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  }
}
```

---

## 2. Level OCD (create payload)

Mirrors the "Course Unit" category role — a non-root structural unit. Keep it minimal; the Level
form comes from the Learning Path OCD's `unitMetadata` form above.

```json
POST /api/object/category/definition/v1/create
{
  "request": {
    "objectCategoryDefinition": {
      "categoryId": "obj-cat:level",
      "targetObjectType": "Collection",
      "objectMetadata": {
        "config": {
          "sourcingSettings": {
            "collection": {
              "objectType": "Collection",
              "primaryCategory": "Level",
              "isRoot": false,
              "iconClass": "fa fa-layer-group",
              "children": { "Content": ["Course"] }
            }
          }
        },
        "schema": {
          "properties": {
            "mimeType": {
              "type": "string",
              "enum": ["application/vnd.ekstep.content-collection"]
            },
            "visibility": {
              "type": "string",
              "enum": ["Parent"],
              "default": "Parent"
            }
          }
        }
      },
      "forms": {}
    }
  }
}
```

---

## 3. Assumptions & notes (review with backend team)

1. **`policy` is the consumption-policy field.** It lives in the root metadata schema
   (`default: "strict"` — strict is the safe default since it needs no prior assessment) and
   is **captured at creation time**: the create form includes it as a required select, and the
   update form keeps it editable afterwards. Raw values match the Viewer Service's
   `tracking_policies` enum (`strict | adaptive | priorLearning`) so a saved path's policy is
   directly usable as that service's batch config with no translation step. Editor labels map
   strict→Strict, adaptive→Adaptive, priorLearning→Prior learning. Note: the backend design doc
   (v11.1) calls this field `strategy` — the doc and the runtime LP aggregator/waiver logic should
   be updated to read `policy`.
2. **`contentType: "Level"`** for Level units (decided, matches `primaryCategory`); `primaryCategory: "Level"`.
3. **The Curriculum section has `framework` + the non-skill categories (`industry`, `domain`) —
   the skill category is deliberately excluded from the root form.** The LP's skill scope comes
   solely from the prior assessment (levels pick within it), so an editable root-level skill field
   would let authors tag skills that contradict what the path actually covers, and would suggest
   it drives the level pickers (it doesn't — `useSkillScope` never reads root metadata). The
   `industry`/`domain` fields are descriptive tagging for discovery only; their codes match USF —
   for other frameworks the editor resolves categories at runtime, so adjust codes per deployed
   framework. *Recommended:* at save/publish the editor writes the **derived** skills union
   (prior assessment + level selections) into the root's skill-category field, so LPs are
   searchable by skill without a manually-editable field ever conflicting.
4. **The Level `unitMetadata` form intentionally has no Skills field.** An earlier draft declared
   one as `code: "competencies"`, but `competencies` is a reserved Sunbird platform field (its
   schema expects competency-ontology association objects — `{id, name, competencyType, ...}` —
   not plain framework-term strings), so submitting it this way is rejected by hierarchy/update
   validation regardless of value shape. A static form field also can't represent this correctly
   anyway, since the right metadata key is the *resolved* skill-category code — `skill` under USF,
   a different code per framework — not a fixed one. The editor renders its own skill picker
   (options from the skill scope: prior assessment's tags, or the full skill-category term list
   with no prior assessment) and writes selections directly to that resolved field.
5. **`trackable.autoBatch: "No"`** — LP batch creation fans out per child course explicitly
   (design doc §3), so auto-batching on publish should stay off unless the batch fan-out service
   keys off it; flip to "Yes" if the LP batch flow is triggered that way.
6. **`generateDIALCodes` and `discussionForum` are omitted** — not applicable to LP v1 (feature
   gating in the editor hides dialcodes regardless).
7. **`maxDepth: 1`** — Levels only; courses/assessment courses are linked leaves. The pre/post
   assessment slots are ordinary Levels at index min/max in the stored hierarchy (editor renders
   them as dedicated slots).
8. Form field shapes (`renderingHints`, `validations`, section objects with `name` + `fields`)
   copied from the live Course OCD create form for compatibility with both the Angular editor's
   form renderer and this editor's `SparkMetaForm`; `templateName` left empty as in the Course
   definition. Verify `inputType: "framework"` matches the platform's supported input types (the
   Course definition drives framework selection differently — via `orgFWType`).
