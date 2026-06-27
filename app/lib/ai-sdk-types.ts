/**
 * Local copy of the AI SDK UI types that ai-elements components depend on.
 *
 * Copied from the `ai` package (Vercel AI SDK) so this codebase does not need
 * `ai` or `@ai-sdk/react` as a runtime dependency. Keep the shape of public
 * types stable so that future migration back to the npm package is mechanical.
 *
 * Source: node_modules/ai/dist/index.d.ts
 */

// ---------- Primitive helpers ----------

export type JSONValue =
  | null
  | string
  | number
  | boolean
  | { [key: string]: JSONValue }
  | JSONValue[]

export type JSONObject = { [key: string]: JSONValue }

export type ValueOf<T> = T[keyof T]

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

/**
 * Provider-specific metadata bag. Kept permissive on purpose — providers attach
 * arbitrary keys here.
 */
export type ProviderMetadata = Record<string, Record<string, JSONValue>>

export type ProviderReference = Record<string, string>

// ---------- Tool helpers ----------

export type Tool = {
  inputSchema?: unknown
  outputSchema?: unknown
}

export type ToolSet = Record<string, Tool>

export type InferToolInput<TOOL extends Tool> = TOOL extends {
  inputSchema: { _type?: infer T }
}
  ? T
  : unknown

export type InferToolOutput<TOOL extends Tool> = TOOL extends {
  outputSchema: { _type?: infer T }
}
  ? T
  : unknown

// ---------- UI Message primitives ----------

export type UIDataTypes = Record<string, unknown>

export type UITool = {
  input: unknown
  output: unknown | undefined
}

export type UITools = Record<string, UITool>

export type InferUITool<TOOL extends Tool> = {
  input: InferToolInput<TOOL>
  output: InferToolOutput<TOOL>
}

export type InferUITools<TOOLS extends ToolSet> = {
  [NAME in keyof TOOLS & string]: InferUITool<TOOLS[NAME]>
}

type asUITool<TOOL extends UITool | Tool> = TOOL extends Tool
  ? InferUITool<TOOL>
  : TOOL

// ---------- UI Message parts ----------

export type TextUIPart = {
  type: "text"
  text: string
  state?: "streaming" | "done"
  providerMetadata?: ProviderMetadata
}

export type CustomContentUIPart = {
  type: "custom"
  kind: `${string}.${string}`
  providerMetadata?: ProviderMetadata
}

export type ReasoningUIPart = {
  type: "reasoning"
  text: string
  state?: "streaming" | "done"
  providerMetadata?: ProviderMetadata
}

export type SourceUrlUIPart = {
  type: "source-url"
  sourceId: string
  url: string
  title?: string
  providerMetadata?: ProviderMetadata
}

export type SourceDocumentUIPart = {
  type: "source-document"
  sourceId: string
  mediaType: string
  title: string
  filename?: string
  providerMetadata?: ProviderMetadata
}

export type FileUIPart = {
  type: "file"
  mediaType: string
  filename?: string
  url: string
  providerReference?: ProviderReference
  providerMetadata?: ProviderMetadata
}

export type ReasoningFileUIPart = {
  type: "reasoning-file"
  mediaType: string
  url: string
  providerMetadata?: ProviderMetadata
}

export type StepStartUIPart = {
  type: "step-start"
}

export type DataUIPart<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`
    id?: string
    data: DATA_TYPES[NAME]
  }
}>

export type UIToolInvocation<TOOL extends UITool | Tool> = {
  toolCallId: string
  title?: string
  toolMetadata?: JSONObject
  providerExecuted?: boolean
} & (
  | {
      state: "input-streaming"
      input?: DeepPartial<asUITool<TOOL>["input"]> | undefined
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval?: never
    }
  | {
      state: "input-available"
      input: asUITool<TOOL>["input"]
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval?: never
    }
  | {
      state: "approval-requested"
      input: asUITool<TOOL>["input"]
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval: {
        id: string
        approved?: never
        reason?: never
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "approval-responded"
      input: asUITool<TOOL>["input"]
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval: {
        id: string
        approved: boolean
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "output-available"
      input: asUITool<TOOL>["input"]
      output: asUITool<TOOL>["output"]
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      resultProviderMetadata?: ProviderMetadata
      preliminary?: boolean
      approval?: {
        id: string
        approved: true
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "output-error"
      input: asUITool<TOOL>["input"] | undefined
      rawInput?: unknown
      output?: never
      errorText: string
      callProviderMetadata?: ProviderMetadata
      resultProviderMetadata?: ProviderMetadata
      approval?: {
        id: string
        approved: true
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "output-denied"
      input: asUITool<TOOL>["input"]
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval: {
        id: string
        approved: false
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
)

export type ToolUIPart<TOOLS extends UITools = UITools> = ValueOf<{
  [NAME in keyof TOOLS & string]: {
    type: `tool-${NAME}`
  } & UIToolInvocation<TOOLS[NAME]>
}>

export type DynamicToolUIPart = {
  type: "dynamic-tool"
  toolName: string
  toolCallId: string
  title?: string
  toolMetadata?: JSONObject
  providerExecuted?: boolean
} & (
  | {
      state: "input-streaming"
      input?: unknown
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval?: never
    }
  | {
      state: "input-available"
      input: unknown
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval?: never
    }
  | {
      state: "approval-requested"
      input: unknown
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval: {
        id: string
        approved?: never
        reason?: never
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "approval-responded"
      input: unknown
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval: {
        id: string
        approved: boolean
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "output-available"
      input: unknown
      output: unknown
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      resultProviderMetadata?: ProviderMetadata
      preliminary?: boolean
      approval?: {
        id: string
        approved: true
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "output-error"
      input: unknown
      output?: never
      errorText: string
      callProviderMetadata?: ProviderMetadata
      resultProviderMetadata?: ProviderMetadata
      approval?: {
        id: string
        approved: true
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
  | {
      state: "output-denied"
      input: unknown
      output?: never
      errorText?: never
      callProviderMetadata?: ProviderMetadata
      approval: {
        id: string
        approved: false
        reason?: string
        isAutomatic?: boolean
        signature?: string
      }
    }
)

export type UIMessagePart<
  DATA_TYPES extends UIDataTypes,
  TOOLS extends UITools,
> =
  | TextUIPart
  | CustomContentUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>
  | DynamicToolUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart
  | ReasoningFileUIPart
  | DataUIPart<DATA_TYPES>
  | StepStartUIPart

export interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> {
  id: string
  role: "system" | "user" | "assistant"
  metadata?: METADATA
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>
}

// ---------- Chat state ----------

export type ChatStatus = "submitted" | "streaming" | "ready" | "error"

// ---------- Usage ----------

export type LanguageModelUsage = {
  inputTokens: number | undefined
  inputTokenDetails?: {
    noCacheTokens: number | undefined
    cacheReadTokens: number | undefined
    cacheWriteTokens: number | undefined
  }
  outputTokens: number | undefined
  outputTokenDetails?: {
    textTokens: number | undefined
    reasoningTokens: number | undefined
  }
  totalTokens: number | undefined
  raw?: JSONObject
  /**
   * Legacy flat fields exposed in older AI SDK versions (v5/v6). Kept here so
   * components written against those versions still compile.
   */
  reasoningTokens?: number
  cachedInputTokens?: number
}

// ---------- Image generation ----------

/**
 * Experimental_GeneratedImage in the AI SDK is an alias of `GeneratedFile`,
 * which describes a binary file emitted by `generateImage`/`streamImage`.
 */
export type Experimental_GeneratedImage = {
  base64: string
  uint8Array: Uint8Array
  mediaType: string
}
