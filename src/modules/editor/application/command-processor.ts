import { AppError } from "@/src/lib/app-error";
import type { GraphSnapshot } from "@/src/domain";
import { validateGraphSnapshotInvariants } from "@/src/modules/graph/domain";
import { EditorCommandSchema, type EditorCommand } from "./schemas";

function applySingleEditorCommand(
  snapshot: GraphSnapshot,
  projectId: string,
  rawCommand: EditorCommand,
): GraphSnapshot {
  const command = EditorCommandSchema.parse(rawCommand);

  switch (command.type) {
    case "addNode": {
      return {
        ...snapshot,
        nodes: [
          ...snapshot.nodes,
          {
            id: command.node.id,
            projectId,
            kind: command.node.kind,
            label: command.node.label,
            position: command.node.position,
            data: command.node.data,
            externalRefs: [],
          },
        ],
      };
    }

    case "updateNode": {
      let found = false;
      const nodes = snapshot.nodes.map((node) => {
        if (node.id !== command.nodeId) {
          return node;
        }
        found = true;
        return {
          ...node,
          ...(command.patch.label !== undefined
            ? { label: command.patch.label }
            : {}),
          ...(command.patch.kind !== undefined ? { kind: command.patch.kind } : {}),
          ...(command.patch.data !== undefined ? { data: command.patch.data } : {}),
        };
      });

      if (!found) {
        throw new AppError("Node nao encontrado para atualizacao.", {
          code: "EDITOR_NODE_NOT_FOUND",
          status: 404,
        });
      }

      return {
        ...snapshot,
        nodes,
      };
    }

    case "moveNode": {
      let found = false;
      const nodes = snapshot.nodes.map((node) => {
        if (node.id !== command.nodeId) {
          return node;
        }
        found = true;
        return {
          ...node,
          position: command.position,
        };
      });

      if (!found) {
        throw new AppError("Node nao encontrado para mover.", {
          code: "EDITOR_NODE_NOT_FOUND",
          status: 404,
        });
      }

      return {
        ...snapshot,
        nodes,
      };
    }

    case "removeNode": {
      const nodeExists = snapshot.nodes.some((node) => node.id === command.nodeId);

      if (!nodeExists) {
        throw new AppError("Node nao encontrado para remocao.", {
          code: "EDITOR_NODE_NOT_FOUND",
          status: 404,
        });
      }

      // Fase 2 policy: remover node faz cascade local nas edges associadas.
      return {
        ...snapshot,
        nodes: snapshot.nodes.filter((node) => node.id !== command.nodeId),
        edges: snapshot.edges.filter(
          (edge) =>
            edge.sourceNodeId !== command.nodeId &&
            edge.targetNodeId !== command.nodeId,
        ),
      };
    }

    case "addEdge": {
      return {
        ...snapshot,
        edges: [
          ...snapshot.edges,
          {
            id: command.edge.id,
            projectId,
            sourceNodeId: command.edge.sourceNodeId,
            targetNodeId: command.edge.targetNodeId,
            kind: command.edge.kind,
            label: command.edge.label,
            data: command.edge.data,
            externalRefs: [],
          },
        ],
      };
    }

    case "updateEdge": {
      let found = false;
      const edges = snapshot.edges.map((edge) => {
        if (edge.id !== command.edgeId) {
          return edge;
        }
        found = true;

        return {
          ...edge,
          ...(command.patch.label !== undefined
            ? { label: command.patch.label }
            : {}),
          ...(command.patch.kind !== undefined ? { kind: command.patch.kind } : {}),
          ...(command.patch.data !== undefined ? { data: command.patch.data } : {}),
        };
      });

      if (!found) {
        throw new AppError("Edge nao encontrada para atualizacao.", {
          code: "EDITOR_EDGE_NOT_FOUND",
          status: 404,
        });
      }

      return {
        ...snapshot,
        edges,
      };
    }

    case "removeEdge": {
      const edgeExists = snapshot.edges.some((edge) => edge.id === command.edgeId);

      if (!edgeExists) {
        throw new AppError("Edge nao encontrada para remocao.", {
          code: "EDITOR_EDGE_NOT_FOUND",
          status: 404,
        });
      }

      return {
        ...snapshot,
        edges: snapshot.edges.filter((edge) => edge.id !== command.edgeId),
      };
    }
  }
}

export function applyEditorCommandToSnapshot(
  snapshot: GraphSnapshot,
  projectId: string,
  command: EditorCommand,
): GraphSnapshot {
  const current = validateGraphSnapshotInvariants(snapshot);
  return validateGraphSnapshotInvariants(
    applySingleEditorCommand(current, projectId, command),
  );
}

export function applyEditorCommandsToSnapshot(
  snapshot: GraphSnapshot,
  projectId: string,
  commands: EditorCommand[],
): GraphSnapshot {
  let nextSnapshot = validateGraphSnapshotInvariants(snapshot);

  for (const command of commands) {
    nextSnapshot = applyEditorCommandToSnapshot(nextSnapshot, projectId, command);
  }

  return nextSnapshot;
}
