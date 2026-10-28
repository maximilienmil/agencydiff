# Meta developer APIs: Muse Spark (1.3), computer use, SAM 3.1, Muse Glimmer (as of 2026-10-28)

Source note: Meta's Model API docs are **publicly readable without login** as Markdown at `https://dev.meta.ai/docs/*.md` (index: https://dev.meta.ai/llms.txt). Old URLs `developer.meta.com/ai/...` and `ai.developer.meta.com/docs/...` 301/302-redirect to `dev.meta.ai`. You only need a login to create API keys (dashboard at https://dev.meta.ai/). Everything below marked "docs" was read directly from those pages on 2026-10-28.

## Muse Spark: base URL, auth, SDKs, compatibility, model IDs, context, media input, tools, structured output, pricing, rate limits

### Takeaway
Muse Spark runs on "Meta Model API" at `https://api.meta.ai/v1`, with a Bearer key and no Meta-specific SDK. You call it with the stock OpenAI SDK (Responses and Chat Completions) or the Anthropic SDK (Messages). Use model ID `muse-spark-1.3` (Standard) or `muse-spark-1.3-contributor` (cheap; Meta may train on your data). Context is 1,048,576 tokens. Standard pricing is $1.25 in / $4.25 out per 1M tokens; Contributor is $0.10 / $0.20. The limit is 3,000 RPM / 4M TPM per team (Standard).

### Cited Findings
**Endpoint and auth**
- Base URL is `https://api.meta.ai/v1`. Auth header is `Authorization: Bearer $MODEL_API_KEY`. Keys start with `LLM_` and look like `LLM_1607358788850350_nx9.....LJY`. You create them in the Model API dashboard under the **API keys** tab, and each key is shown only once — [Authentication](https://dev.meta.ai/docs/authentication.md)
- The docs and cookbook use the env var name `MODEL_API_KEY`. The OpenAI SDK will not read it automatically (it looks for `OPENAI_API_KEY`), so pass `api_key=os.environ["MODEL_API_KEY"]` — [SDKs](https://dev.meta.ai/docs/sdks.md)
- The macOS cookbook recipe writes the key format as `LLM|{numeric_id}|{secret}` (pipes). The auth page shows underscores. This is a minor doc inconsistency: copy the key exactly as the dashboard gives it — [macOS CU recipe](https://dev.meta.ai/docs/cookbook/computer-use-macos.md) vs [Authentication](https://dev.meta.ai/docs/authentication.md)

**SDKs and compatibility**
- "Meta Model API doesn't need a client of its own": use the OpenAI SDK (`pip install openai` / `npm install openai`) for `client.responses.create()` and `client.chat.completions.create()`, and the Anthropic SDK for Messages. Any OpenAI-compatible client works (LangChain, LlamaIndex, Vercel AI SDK, LiteLLM with the `openai/muse-spark-1.3` prefix) — [SDKs](https://dev.meta.ai/docs/sdks.md)
- Anthropic SDK setup is `base_url="https://api.meta.ai"` (the SDK appends `/v1/messages`) and `auth_token=MODEL_API_KEY`. Responses begin with a `redacted_thinking` block, so read the `text` blocks rather than `content[0]` — [SDKs](https://dev.meta.ai/docs/sdks.md)
- Endpoints in the API reference: `/v1/responses` (create, retrieve, delete, cancel, `/v1/responses/input_tokens`), `/v1/chat/completions`, `/v1/messages` (plus count-tokens), `/v1/files`, `/v1/models`, `/v1/images/generations`, `/v1/images/edits`, `/v1/asr/transcribe`, and `wss://api.meta.ai/v1/asr/realtime` — [llms.txt index](https://dev.meta.ai/llms.txt); [Models](https://dev.meta.ai/docs/models.md)
- Responses keeps state with `previous_response_id`; Chat Completions is stateless. Docs recommend a `developer` message over `system`. `reasoning_effort` is supported, and reasoning tokens are billed as output (`usage.completion_tokens_details.reasoning_tokens`) — [Build with Muse Spark blog, 2026-07-08](https://dev.meta.ai/resources/blog/build-with-muse-spark/)

**Model IDs and context**
- Muse Spark versions: `muse-spark-1.3` ("latest… tuned for agentic workflows (multi-step tool, browser, and long-horizon tasks)… Recommended for new work"), `muse-spark-1.2`, and `muse-spark-1.1`. All take text, image, video, audio, and PDF input, return text, and have a **1,048,576-token context window**. 1.3 supports reasoning effort up to `"max"`, except on `muse-spark-1.3-contributor` — [Models](https://dev.meta.ai/docs/models.md)
- Contributor-mode IDs are `muse-spark-1.3-contributor` and `muse-spark-1.2-contributor`. 1.1 is Standard-only — [Models](https://dev.meta.ai/docs/models.md)
- Audio input on 1.3 is "not fully supported" and may degrade; Meta recommends 1.2 for audio — [Models](https://dev.meta.ai/docs/models.md)
- Higher tier: `muse-wonder-1.0` ("Meta's most capable model", preview, 1,048,576 context, Standard only on the API). **Meta's computer-use guide uses `muse-wonder-1.0` by default.** — [Models](https://dev.meta.ai/docs/models.md)
- Muse Spark 1.3 blog date: September 2, 2026 — [Meta research blog](https://research.meta.ai/blog/introducing-muse-spark-1-3)
- Availability can vary by country; see the Geographic Use Policy. The July launch blog said public preview was US-only — [Models](https://dev.meta.ai/docs/models.md); [launch blog](https://dev.meta.ai/resources/blog/build-with-muse-spark/)

**Image and video input**
- Images on Responses: `{"type":"input_image","image_url": "<https URL or data:image/png;base64,...>"}`. On Chat Completions: `{"type":"image_url","image_url":{"url":...}}` — [Computer use](https://dev.meta.ai/docs/computer-use.md); [launch blog](https://dev.meta.ai/resources/blog/build-with-muse-spark/)
- Image limits: 50 MB inline, 1 GiB via the Files API, and **at most 50 images per request** (more returns HTTP 400). MIME types are jpeg, png, gif, webp, and x-icon. A ~1280px image costs about 1,300–1,500 input tokens. Use `POST /v1/responses/input_tokens` for exact counts — [Image understanding](https://dev.meta.ai/docs/image-understanding.md)
- Video: `{"type":"input_video","video_url": <public or base64 data URL>}` or `file_id` from `POST /v1/files`. Muse Spark video understanding supports mp4, and embedded audio is read too — [Video understanding](https://dev.meta.ai/docs/video-understanding.md)
- Files: 50 MB inline, 1 GiB per upload, and 100 GiB of storage per team. Uploaded files don't expire, so delete them yourself — [File handling](https://dev.meta.ai/docs/file-handling.md)
- For grounding with the VLM (not the computer tool), Muse Spark reports positions on a **normalized 0–1000 grid**, where (0,0) is top-left — [Image understanding](https://dev.meta.ai/docs/image-understanding.md)

**Tool calling and structured output**
- Function tools are supported on Chat Completions and Responses, including parallel calls. **`tool_choice` must be `"auto"`**: `"none"`, `"required"`, and named choices return HTTP 400. `max_tool_calls` limits only built-in tools such as `web_search` — [Tool calling](https://dev.meta.ai/docs/tool-calling.md)
- Structured output uses constrained decoding. On Chat Completions, set `response_format: {type: "json_schema", json_schema: {...}}`. **On the Responses API the parameter is `text.format`**, and a parameter from the other endpoint is ignored — [Structured output](https://dev.meta.ai/docs/structured-output.md)
- `web_search` costs $2.50 per 1,000 queries on top of tokens — [Pricing](https://dev.meta.ai/docs/pricing-rate-limits.md)

**Pricing (per 1M tokens)**
- Muse Spark Standard: cached input $0.15, input $1.25, output $4.25. Contributor (`*-contributor`): cached $0.002, input $0.10, output $0.20. There is no long-context premium — [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits.md)
- Muse Wonder (Standard only): cached $0.20, input $4.00, output $20.00 — [Pricing](https://dev.meta.ai/docs/pricing-rate-limits.md)
- Contributor mode means "your content… [may be used] to train future Meta models" in exchange for the discount. Standard mode does not train on your content — [Pricing](https://dev.meta.ai/docs/pricing-rate-limits.md)

**Rate limits (per team, not per key)**
- `muse-spark-1.3` / `1.2` / `1.1` / `muse-wonder-1.0`: 3,000 RPM and 4,000,000 TPM. `muse-spark-1.3-contributor` / `1.2-contributor`: **150 RPM**, 3,000,000 TPM. `sam-3.1`: 3,000 RPM with no TPM limit. Background responses: 600 submissions/min. Response headers: `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`, `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`. A 429 may carry `Retry-After` — [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits.md)

### Inferences
- A computer-use agent can be built with the plain `openai` Python or TS package pointed at `https://api.meta.ai/v1`; no new SDK dependency is needed.
- Contributor mode's 150 RPM limit and its training-on-data terms make it a poor fit for anything handling user screenshots that may contain private data. Standard `muse-spark-1.3` is the safe default.
- At about 1.4k tokens per 1280px screenshot and $1.25/M input, each screenshot turn costs roughly $0.002 in input on Spark (Standard), before history replay. Long histories dominate cost unless they are truncated.

### Gaps
- No public SLA or latency figures for Muse Spark were found.
- The structured-output page confirms `text.format` on Responses, but I did not extract its exact Responses JSON example. Check https://dev.meta.ai/docs/structured-output.md before coding it.
- Exact video size and duration limits for Muse Spark video understanding were not extracted (only "mp4" plus the general 50 MB inline / 1 GiB file limits).

## Computer use: tool, action format, coordinates, environments, sample code, harnesses, benchmarks

### Takeaway
There is a dedicated native tool, `{"type":"computer"}`, and it works **only on the Responses API**. The model returns `computer_call` items with a batched `actions` array (click, double_click, drag, keypress, move, scroll, type, screenshot, wait) in **pixel coordinates of the last screenshot you sent**. You send back `computer_call_output` with a `computer_screenshot` data URL. This is effectively the OpenAI CUA wire shape. Meta runs no VM: you supply the driver (Playwright, pyautogui, or a container). Meta's cookbook recipes use different conventions (MCP tools, or a function tool with normalized 0–1000 coordinates), so pick one and don't mix them. Reliability numbers are thin and mostly secondary.

### Cited Findings
**Tool definition and loop**
- "Add a single tool entry… The computer tool takes only a `type`: `{"tools": [{"type": "computer"}]}`. There are no display-size or environment fields to configure… the same tool definition works for a browser viewport, a full desktop, or a sandboxed VM." The Responses API is "its only supported endpoint" — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- "There's no server-side virtual machine: Meta doesn't run a browser or desktop for you" — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Loop: send the task and initial screenshot; receive `computer_call`; execute its actions; return a `computer_call_output` with a fresh screenshot; repeat until there is no `computer_call`. The final assistant message ends the run — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Example `computer_call`: `{"type":"computer_call","id":"cc_abc123","call_id":"call_abc123","actions":[{"type":"click","button":"left","x":412,"y":315},{"type":"type","text":"quarterly revenue"},{"type":"keypress","keys":["Enter"]}],"pending_safety_checks":[],"status":"completed"}` — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)

**Action vocabulary**

| `type` | Fields |
|---|---|
| `click` | `button` (`left`/`right`/`wheel`/`back`/`forward`), `x`, `y` |
| `double_click` | `x`, `y` |
| `drag` | `path` (array of `{x, y}`) |
| `keypress` | `keys` (array of strings) |
| `move` | `x`, `y` |
| `scroll` | `x`, `y`, `scroll_x`, `scroll_y` |
| `type` | `text` |
| `screenshot` | none |
| `wait` | none |

Source: [Computer use guide](https://dev.meta.ai/docs/computer-use.md)

**Coordinates, screenshots, state, safety**
- "Coordinates are **pixel coordinates** in the space of the screenshot you last sent: `(0, 0)` is the top-left… keep the screenshot size stable across a trajectory. For browser use, screenshot the viewport… not the full page." — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Return format: `{"type":"computer_call_output","call_id":"call_abc123","acknowledged_safety_checks":[],"output":{"type":"computer_screenshot","image_url":"data:image/png;base64,<...>"}}`. The image must be PNG or JPEG, with a MIME type that matches and decoded size ≤ 25 MiB; otherwise HTTP 400 — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Safety: `pending_safety_checks` items are `{id, code, message}` (for example `code: "malicious_instructions"`). Echo accepted ones in `acknowledged_safety_checks` — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- State: `previous_response_id` with `store: true` (the default), or stateless replay with `store:false`. Stateless replay needs `meta_safety_replay_receipt` copied unchanged into each replayed item, and "Direct stateless replay holds up to 29 call/output pairs." `truncation: "auto"` trims old screenshots "where it's enabled for your account", else HTTP 400. Reaching `max_output_tokens` gives `status:"incomplete"` — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Model choice: the guide's loop uses `muse-wonder-1.0`, and "Muse Spark runs the same loop at lower cost: set both `model` values to `muse-spark-1.3`." — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Full Python loop sample (OpenAI SDK, `client.responses.create(model=..., instructions=system_prompt, tools=[{"type":"computer"}], input=[{"role":"user","content":[{"type":"input_text",...},{"type":"input_image","image_url":...}]}])`) and a recommended strict system prompt are on the page — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)

**Environments, drivers, harnesses**
- Suggested drivers: Playwright or Puppeteer for browsers, pyautogui for desktops, and a disposable VM or container for sandboxing. There is no Meta-provided Playwright integration; the guide just names it. Code execution via a function tool (for example `run_browser_script`) is offered as an alternative — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)
- Linux recipe: `muse-spark-1.3` with OpenCode and the **Cua** computer-use MCP (trycua/cua Docker Ubuntu sandbox, `cua sandbox launch --local ubuntu:24.04`). The bridge `cua_local_mcp.py` exposes `cua_left_click`, `cua_right_click`, and similar tools. The recipe hit the **50-images-per-request limit** and used sub-agents to work around it. Code: github.com/meta-models/meta-model-cookbook/03_use_cases/12_computer_use — [CU cookbook](https://dev.meta.ai/docs/cookbook/computer-use.md)
- macOS recipe `metacua` (Swift and Python, `muse-spark-1.3`) does **not** use the native computer tool. It defines a function tool `computer.computer` plus `computer.stop`, "mirror[ing] Anthropic's `computer_20251124` interface… except coordinates are normalized to `0...1000`." It sets `parallel_tool_calls: false` and `store: false`, has an optional `--batched-actions` mode, and an "OSWorld `pyautogui` mode" that parses but never execs. It calls this the "Muse Spark reference agent" naming. It controls the primary display only — [macOS CU recipe](https://dev.meta.ai/docs/cookbook/computer-use-macos.md)
- Mobile: no official mobile (Android/iOS) computer-use guidance was found. The docs cover browser and desktop only — [Computer use guide](https://dev.meta.ai/docs/computer-use.md)

**Reliability numbers**
- Meta's Muse Spark 1.1 evaluation report (PDF) describes its methodology. OSWorld-Verified used a 361-task split (excluding Google Drive tasks), a GUI computer-control tool only, a 200-step cap, screenshot truncation, xhigh reasoning, and mean per-task reward. It also covers OSWorld 2.0 (108 long-horizon workflows) and WebArena-Verified (812 tasks via the OpenClaw browser tool, DOM plus screenshots, mean pass@1). **The score values appear to be in chart images I could not extract** — [Muse Spark 1.1 evaluation report](https://ai.meta.com/static-resource/muse-spark-1-1-evaluation-report/)
- Secondary sources disagree on 1.1 OSWorld-Verified: **80.8** ([eesel.ai](https://www.eesel.ai/blog/meta-muse-spark-11)) vs **53.3%** ([docsbot.ai](https://docsbot.ai/models/compare/muse-spark-1-3/muse-spark)). Neither is verified.
- Muse Spark 1.3: OSWorld 2.0 partial score **66.9%** (Meta-reported, max effort per aggregators), with a binary completion rate listed as 32 — [docsbot.ai](https://docsbot.ai/models/compare/muse-spark-1-3/muse-spark); [OpenCode data](https://opencode.ai/data/meta/muse-spark-1-3.md); [BenchLM](https://benchlm.ai/models/muse-spark-1-3). The Meta 1.3 blog shows its scorecard only as an image — [Meta research blog](https://research.meta.ai/blog/introducing-muse-spark-1-3)

### Inferences
- The native tool's wire format (`computer_call`, `actions[]`, `computer_call_output`, `computer_screenshot`, `pending_safety_checks`) closely matches OpenAI's Responses CUA shape. Existing OpenAI-CUA harness code should port with little change, though this was not tested.
- Coordinates come in three conventions: native tool = screenshot pixels; VLM grounding and the metacua function tool = 0–1000 normalized; OSWorld mode = fixed 1920x1080. A harness should pin one, and always send screenshots at the size the driver will act on (or rescale actions by sent→actual ratio).
- The 50-images-per-request cap affects stateless replay and long trajectories. Plan to use `previous_response_id` chaining, `truncation:"auto"` (if enabled), or your own history pruning.

### Gaps
- No verified, Meta-text-sourced OSWorld or WebArena numbers for Muse Spark 1.3 or Muse Wonder. Benchmark numbers are aggregator-only, and the 1.1 figures conflict.
- No per-step latency figures for computer-use calls.
- I could not confirm whether `truncation:"auto"` is broadly enabled or allowlisted.
- I did not verify whether the native `computer` tool can be combined with function tools in the same request (the guide links to tool calling but shows no example).

## SAM 3.1 API

### Takeaway
SAM 3.1 is **hosted on Meta Model API** as model `sam-3.1`, called through `POST https://api.meta.ai/v1/responses`. There are no separate image and video endpoints: you swap `input_image` for `input_video`. It takes either a noun-phrase concept prompt or box/point prompts written in a token grammar. Output is **special-token text** in `output_text` (box coordinates, base85 masks, object IDs, optional confidence), not JSON. Official parsers decode it into rasters, COCO RLE, or SVG. Price is $2.50 per 1,000 images and $0.20 per 1,000 video frames (50-frame minimum per video request). Open weights also exist at HF `facebook/sam3.1`.

### Cited Findings
**Request**
- The model ID is `sam-3.1`. Input is text prompt plus image or video; output is boxes and masks. Use `POST /v1/responses` and upload clips through the Files API — [Models](https://dev.meta.ai/docs/models.md); [SAM overview](https://dev.meta.ai/docs/sam/overview.md)
- One user message holds an `input_text` (the prompt) plus one media part: `input_image` (`image_url`: public URL or base64 data URL) or `input_video` (`video_url`, or `file_id` from `POST /v1/files` with `purpose=user_data`) — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- Concept prompts take **one** short noun phrase per request. Lists like "bus, bicycle" return zero matches. Negation, OR, and spatial phrasing are unreliable. Zero matches gives an empty `output_text`, not an error — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- Box/point prompts use the same `input_text` with a token grammar, and cannot be combined with a phrase. Example: `<0f>1<|box;x1=444;y1=626;x2=675;y2=849;w=1800;h=1200|>,2<|point;x=1430;y=700;w=1800;h=1200|>-<|point;x=1300;y=450;w=1800;h=1200|>`. A leading `-` makes a point negative. Each object gets at most one box per frame. `w` and `h` must equal the media's displayed pixel size; a mismatched aspect ratio returns 400 — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- Video can be prompted on multiple frames (`<30f>…<120f>…`). `metadata.propagation_direction` takes `both` (default), `forward`, or `backward` — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- `metadata.include_confidence: "true"` (a string) adds `c` (0–1) to each box and mask. `metadata.mask_encoding`: `"lossless"` (default, `~` marker) or `"one_bit"` (`!` marker, several times smaller). Box/point prompts always return one_bit — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- Streaming (`stream: true`, with `response.output_text.delta` per frame through `response.completed`) is recommended for video but not required. Results "can vary slightly between runs" — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)

**Response format**
- Line grammar: `<Nf>id<|box;x1=..;y1=..;x2=..;y2=..;w=<frameW>;h=<frameH>[;c=..]|><|mask;x=0;y=0[;c=..];data=<H>,<W>,<enc>payload|>,id...`. There is one line per frame, and frames with no objects are skipped. Box corners are in source pixels, with x2 and y2 inclusive. Mask `data` is **height,width** and then the encoding marker. The **payload is base85, not base64**. Object IDs are stable across frames, not dense, and "not 0-based" (with box/point prompts, IDs are the ones you supplied). Example: `<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,101,~...|>` — [Reading segmentation output](https://dev.meta.ai/docs/sam/reading-segmentation.md)
- Mask raster dims are "smaller than the frame". `decodeMaskToRaster` returns a row-major `Uint8Array` of 0/1 of length H*W — [Reading segmentation output](https://dev.meta.ai/docs/sam/reading-segmentation.md)
- Client libraries: `@meta-sam/parser` (TS, zero dependencies; `parseImageStream`, `parseVideoStream`, `recordsOfKind`, `decodeMaskToRaster`, `buildObjectPrompt`), optional `@meta-sam/graphics`, `@meta-sam/video`, and `@meta-sam/react`. Python: `pip install meta-sam-parser` (imported as `meta_sam_parser`, Python ≥3.10) with `decode_mask_to_raster`, `decode_mask_to_rle`, `decode_mask_to_svg_path`, and `build_object_prompt`. Confidence needs parser ≥0.0.13 (TS) or ≥0.0.6 (Py). The prompt builder needs ≥0.1.0 — [Client libraries](https://dev.meta.ai/docs/sam/client-libraries.md); [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)

**Limits, pricing, errors**
- Video: MP4 or MOV with H.264, H.265, or MPEG-4 (no VP9 or WebM). Up to 15,000 frames (~10 minutes) per request. At most 16 tracked objects per video frame and 16 prompted objects per request. Image concept requests return every instance. Uploaded MP4s without faststart are remuxed losslessly — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- Pricing: image segmentation $2.50 per 1,000 images; video $0.20 per 1,000 frames, with each video request billed at ≥50 frames. Usage is reported in `usage.video_frames_processed`. Rate limit is 3,000 RPM — [Pricing](https://dev.meta.ai/docs/pricing-rate-limits.md)
- Errors: a 400 includes a descriptive message (for example `invalid prompt: object prompts cannot be combined with a phrase`, `point (...) lies outside the 1800x1200 frame`, or `17 objects exceed this model's limit of 16`). A 404 returns `model_not_found` when the team lacks access — [Segmenting](https://dev.meta.ai/docs/sam/segmenting.md)
- General inline media cap is 50 MB, or 1 GiB via Files — [File handling](https://dev.meta.ai/docs/file-handling.md)

**Open weights**
- GitHub `facebookresearch/sam3`: SAM 3.1 "Object Multiplex" was released 2026-03-27, with checkpoints at HF `facebook/sam3.1`. SAM 3 access on HF is gated (request access, then `hf auth login`). Code is under the "SAM License". Requirements: Python ≥3.12, PyTorch ≥2.7, CUDA ≥12.6 GPU. The model is 848M parameters. Image API: `build_sam3_image_model()` and `Sam3Processor` with `set_image` / `set_text_prompt`, returning `masks`, `boxes`, `scores`. Video API: `build_sam3_video_predictor()` with `handle_request(type="start_session"|"add_prompt", ...)` — [facebookresearch/sam3](https://github.com/facebookresearch/sam3)
- SAM 3.1 claims about a 7x speedup at 128 objects on one H100 vs SAM 3 (Nov 2025) and mixed or improved accuracy (VOS better on 6 of 7) — [RELEASE_SAM3p1.md](https://github.com/facebookresearch/sam3/blob/main/RELEASE_SAM3p1.md)

### Inferences
- For UI screenshots, point or box prompts (for example, the agent's intended click point) give targeted masks at $0.0025 per image. Concept prompts like "button" or "text field" will return every instance, which suits element enumeration. The docs' own example uses prompt `button` on a 537×561 UI-like image.
- Because masks are smaller than the frame, the mask raster likely needs to be placed or upscaled relative to the box or frame. Use the official parser rather than hand-rolling. **This is an inference: the exact mapping of the H×W raster to frame pixels was not stated in what I read.**
- Video frames can go either as one clip (cheap per frame, 50-frame minimum, tracking IDs) or as individual images ($2.50/1k, no tracking). For sparse keyframes, per-image calls may be simpler. For more than ~50 frames, video is about 12x cheaper per frame.

### Gaps
- No published latency for hosted SAM 3.1 (per image or per frame).
- No explicit max image resolution for `sam-3.1` beyond the general 50 MB inline / 1 GiB file caps.
- The exact geometric relation between the mask raster (H,W "smaller than the frame") and the frame or box was not confirmed. Check `client-libraries.md` and the decode functions.
- Gating and licence status of `facebook/sam3.1` on HF was not confirmed (SAM 3 is gated under the SAM License).

## Muse Glimmer (open weights)

### Takeaway
Muse Glimmer is a 30B dense multimodal model (text and image in, text out), distilled from Muse Spark, released under **Apache 2.0**. It has 128K default context and is available on HF as `meta-models/Muse-Glimmer-30B`. bf16 needs about 60 GB of weights; Q4 GGUF is about 17 GB and fits under 24 GB VRAM. It is not on the hosted API.

### Cited Findings
- 30B dense decoder-only model with a built-in vision encoder. Text and image input, text output. 128K tokens by default, "longer contexts supported". Trained on 100+ languages. Apache License 2.0. Runtimes: vLLM, SGLang, llama.cpp, Ollama, LM Studio, ExecuTorch, and others — [Muse Glimmer overview](https://dev.meta.ai/docs/muse-glimmer.md)
- HF repos: `meta-models/Muse-Glimmer-30B` (bf16 safetensors, about 60 GB), `-GGUF` (`Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf` at about 17 GB "fits under 24 GB VRAM"; dynamic Q4_K_XL at about 20 GB for 32 GB VRAM; `mmproj` vision projector at about 1.4 GB, needed for images), `-assistant` (DFlash draft for speculative decoding), and `-ExecuTorch-PTE` — [Get the model](https://dev.meta.ai/docs/muse-glimmer/get-the-model.md)
- Verified hardware includes Intel Arc Pro B70 ×2 (32 GB each), Xeon 6 CPU-only (>512 GB DDR5 suggested), and NVIDIA B300. bf16 needs 80 GB of free disk — [Hardware platforms](https://dev.meta.ai/docs/muse-glimmer/hardware-platforms.md)
- Also open: Muse Spark Open, an 816B MoE with 42B active parameters (BF16 or NVFP4), served via SGLang, vLLM, TensorRT-LLM, llama.cpp, or hosted providers — [Models](https://dev.meta.ai/docs/models.md)

### Inferences
- Glimmer could serve as a local or offline fallback VLM for screenshot understanding on a single 24–32 GB GPU at Q4. Its computer-use competence is undocumented.

### Gaps
- No computer-use or OSWorld numbers for Glimmer.
- No confirmation that Glimmer was trained on the `computer` tool protocol.

## Official code samples, cookbooks, repos

### Takeaway
The canonical sources are the docs at dev.meta.ai/docs (Markdown, with an llms.txt index), the cookbook repo `github.com/meta-models/meta-model-cookbook`, the HF org `meta-models`, and `facebookresearch/sam3` for SAM weights. The older `meta-llama` org is linked only for Llama.

### Cited Findings
- Docs index (all pages as `.md`): https://dev.meta.ai/llms.txt. Key pages: `/docs/computer-use.md`, `/docs/cookbook/computer-use.md`, `/docs/cookbook/computer-use-macos.md`, `/docs/cookbook/basic-agent-loop.md`, `/docs/cookbook/perception-grounding.md`, `/docs/cookbook/structured-output.md`, `/docs/cookbook/sam-api-basics.md`, `/docs/sam/*.md`, `/docs/cookbook/voice-chess-cua.md` — [llms.txt](https://dev.meta.ai/llms.txt)
- GitHub org `meta-models` and HF `meta-models`, linked from the docs footer. Cookbook paths: `meta-model-cookbook/03_use_cases/12_computer_use/cua_local_mcp.py` and `03_use_cases/13_macos_cua/` (metacua Swift and Python) — [CU cookbook](https://dev.meta.ai/docs/cookbook/computer-use.md); [macOS recipe](https://dev.meta.ai/docs/cookbook/computer-use-macos.md)
- SAM open-source code: https://github.com/facebookresearch/sam3, including `examples/sam3.1_video_predictor_example.ipynb` — [RELEASE_SAM3p1.md](https://github.com/facebookresearch/sam3/blob/main/RELEASE_SAM3p1.md)

### Inferences
- The `metacua` Python implementation is the closest thing to an official reference harness for a Muse Spark CUA, including an OSWorld mode. The native-tool loop in `/docs/computer-use.md` is the minimal reference.

### Gaps
- I did not browse the meta-model-cookbook GitHub repo directly to confirm file contents or licence; the paths come from the docs' links.
- No official Playwright-specific sample was found; Playwright is only named as a suggested driver.
