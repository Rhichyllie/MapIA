import { enUSEditorCoreMessages } from "./en-US-core";
import { enUSEditorShellMessages } from "./en-US-shell";

export const enUSEditorMessages = {
  ...enUSEditorCoreMessages,
  ...enUSEditorShellMessages,
} as const;

export default enUSEditorMessages;
