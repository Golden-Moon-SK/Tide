/**
 * The models the assistant can run on, shared by the picker and the relay.
 *
 * The route validates whatever the browser asks for against this list, so an
 * unknown id can never be forwarded to OpenRouter on the owner's key.
 */

export interface AssistantModel {
  id: string;
  label: string;
}

export const MODELS: AssistantModel[] = [
  {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek Flash",
  },
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM Flash",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

export function isModelId(value: unknown): value is string {
  return typeof value === "string" && MODELS.some((model) => model.id === value);
}
