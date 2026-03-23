export const enUSEditorCoreMessages = {
  page: {
    title: "Visual editor",
    description:
      "Daily workspace with saving, versions and a technical inspector.",
    emptyProjectSelectionDescription:
      "Select a project in the workspace to open the editor.",
    emptyProjectSelectionBody:
      "The editor works on the project's persisted working snapshot.",
    loadErrorFallback: "The editor for this project could not be loaded.",
    loadErrorDescription: "Failed to load the requested project.",
    emptyInitialMapTitle: "Initial map not created yet",
    emptyInitialMapDescription:
      "Run the creation assistant to generate the initial map before editing.",
    openAssistant: "Open assistant",
  },
  canvasToolbar: {
    toolbarAria: "Canvas tools",
    zoomOutAria: "Zoom out",
    zoomInAria: "Zoom in",
    centerAria: "Center selection",
  },
  commandPalette: {
    dialogAria: "Search canvas node",
    label: "Search node",
    placeholder: "Type to search by name",
    emptyState: "No node found.",
    technicalKind: " (kind: {kind})",
  },
  semantics: {
    connectionAssistant: {
      dialogAria: "Connection assistant",
      title: "Invalid connection",
      attemptLabel: "Attempt:",
      keyboardHint:
        "Use the arrow keys to navigate and Enter to confirm a relationship.",
      technicalKind: " (kind: {kind})",
      recommendedBadge: "Recommended",
      emptyState: "No valid relationship is available for this connection.",
      cancel: "Cancel",
    },
    repairDialog: {
      dialogAria: "Semantic repair",
      defaultTitle: "Semantic repair required",
      applyRepair: "Apply and repair",
      applyRemoveInvalid: "Apply and remove invalid items",
      cancel: "Cancel",
    },
  },
  autosave: {
    noPendingChanges: "No pending changes.",
    pendingChanges: "Pending changes.",
    pendingChangesQueued: "Pending changes queued for saving.",
    saving: "Saving...",
    savingChanges: "Saving changes...",
    savingManually: "Saving manually...",
    saved: "Saved.",
  },
  inspectorFeedback: {
    defaultValidationMessage: "The form could not be validated.",
    reviewFields: "Review the fields with errors.",
    invalidKind: "Invalid type.",
    jsonObjectRequired: "Data must be a JSON object (key/value).",
    invalidJson: "Invalid JSON. Check keys, commas and quotes.",
    labelRequired: "Label is required.",
  },
  presentation: {
    fallbacks: {
      untitled: "Untitled",
      untitledNode: "Untitled node",
      manualSource: "Manual source",
    },
  },
  processInspector: {
    node: {
      openPrevious: "Open previous step",
      openBranch: "Open branch",
      openNote: "Open note",
      openNext: "Open next step",
      flowReadingTitle: "Flow reading",
      positionLabel: "Position",
      connectivityLabel: "Connectivity",
      generalHelper: "Adjust the name and role of the focused segment.",
      outOfProfile: " (out of profile)",
      detailsHelper:
        "Use operational context and tags only when they improve understanding.",
      relationsHelper:
        "{incomingCount} incoming, {outgoingCount} outgoing and {previewCount} highlighted relation(s).",
      openTransition: "Open transition",
    },
    edge: {
      transitionReadingTitle: "Transition reading",
      readingLabel: "Reading",
      removeTransition: "Remove transition",
    },
  },
  renderers: {
    tree: {
      rootBadge: "Root",
      hierarchyBadge: "Hierarchy",
      expand: "Expand",
      collapse: "Collapse",
    },
    erd: {
      comment: "Comment",
      table: {
        field: "Field",
        type: "Type",
        flags: "Flags",
      },
      emptyFields: "No fields defined.",
    },
    sitemap: {
      home: "Home",
      section: "Section",
    },
    timeline: {
      milestone: "Milestone",
    },
    mindmap: {
      root: "Central topic",
      reference: "Reference",
      branch: "Branch",
    },
  },
  selectionHud: {
    moreActions: "More actions",
    center: "Center",
    duplicate: "Duplicate",
    remove: "Remove",
  },
  versionDiff: {
    edgeKindCount: "{prefix}{count} relation(s) {label}",
    nodeRenamed:
      "{nodeKind} '{previousLabel}' renamed to '{nextLabel}'.",
    nodeKindChanged:
      "{nodeLabel} changed kind: {previousKind} -> {nextKind}.",
    nodePayloadUpdated: "Payload for '{nodeLabel}' was updated.",
    nodeAdded: "+ {nodeKind} '{nodeLabel}' added.",
    nodeRemoved: "- {nodeKind} '{nodeLabel}' removed.",
    edgesAddedSuffix: "{edgeEntry} created.",
    edgesRemovedSuffix: "{edgeEntry} removed.",
    edgesChanged: "{count} relation(s) had attributes changed.",
    viewportChanged: "Canvas viewport changed.",
    noChanges: "No changes detected.",
  },
  graph: {
    quickAddRoles: {
      "graph-core": {
        label: "Core",
        description: "Central component in the network.",
      },
      "graph-topic": {
        label: "Component",
        description:
          "Architecture piece connected to the core or other components.",
      },
      "graph-supporting": {
        label: "Supporting service",
        description:
          "Supporting, adapter, edge or transversal context in the structure.",
      },
    },
    nodeKinds: {
      workspace: {
        labelOperational: "Component",
        description: "Element used in the architectural reading of the network.",
      },
      project: {
        labelOperational: "Component",
        description: "Element used in the architectural reading of the network.",
      },
      entity: {
        labelOperational: "Component",
        description:
          "Service, module or main capability inside the network.",
      },
      page: {
        labelOperational: "Supporting service",
        description:
          "Cross-cutting support, adapter, boundary or side infrastructure.",
      },
      note: {
        labelOperational: "Context",
        description:
          "Supporting note for architectural context, constraint or observation.",
      },
      "flow-step": {
        labelOperational: "Service",
        description: "Operational element used as an active network capability.",
      },
    },
    roles: {
      "graph-core": {
        roleBadgeLabel: "Network core",
        selectionBadgeLabel: "Core in focus",
        footprintLabel: "Coordinates the main network",
        summaryFallback:
          "Central architecture point. Use it to organize dependencies, integrations and network boundaries.",
      },
      "graph-topic": {
        roleBadgeLabel: "Connected component",
        selectionBadgeLabel: "Component in focus",
        footprintLabel: "Participates in the active network",
        summaryFallback:
          "Component that participates in the structure's integrations and dependencies.",
      },
      "graph-supporting": {
        roleBadgeLabel: "Architecture support",
        selectionBadgeLabel: "Support in focus",
        footprintLabel: "Supports and contextualizes the network",
        summaryFallback:
          "Transversal capability, supporting service or context for the network.",
      },
    },
    structureTips: {
      connectivity:
        "Network reading: {incomingCount} incoming and {outgoingCount} outgoing connection(s).",
      core:
        "Use this item to orient the main network and avoid diffuse dependencies.",
      topic:
        "Review side integrations and direct dependencies of this component.",
      supporting:
        "Use this item for support, context, adaptation or system boundary.",
    },
    connectivityLabel:
      "Receives {incomingCount} connection(s) and sends {outgoingCount}.",
  },
} as const;

export default enUSEditorCoreMessages;
