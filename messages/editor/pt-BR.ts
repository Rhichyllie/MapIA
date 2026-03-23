import { ptBREditorCoreMessages } from "./pt-BR-core";
import { ptBREditorShellMessages } from "./pt-BR-shell";

export const ptBREditorMessages = {
  ...ptBREditorCoreMessages,
  ...ptBREditorShellMessages,
} as const;

export default ptBREditorMessages;
