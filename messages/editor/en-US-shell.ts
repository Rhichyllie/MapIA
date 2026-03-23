export const enUSEditorShellMessages = {
  shell: {
    canvasAriaLabel: "Editor canvas",
    rendererLabels: {
      tree: "Hierarchy",
      flow: "Flow",
      sitemap: "Sitemap",
      erd: "ERD",
      graph: "Graph",
      timeline: "Timeline",
      mindmap: "Mind map",
    },
    topBar: {
      quickFind: "Search (Ctrl+K)",
      fitView: "Fit view",
      organize: "Organize",
      showValidation: "Validate",
      hideValidation: "Hide validation",
      erdValidationLevel: "ERD validation",
      exportPreview: "Generate/Export (preview)",
      exportPreviewGenerating: "Generating preview...",
      enterFocus: "Enter focus",
      exitFocus: "Exit focus",
    },
    buttons: {
      removeSelected: "Remove selected",
      save: "Save",
      reapplyLayout: "Reapply layout",
    },
    common: {
      cancel: "Cancel",
      save: "Save",
    },
    selection: {
      openTransition: "Edit transition",
      openInspector: "Edit in inspector",
      edit: "Edit",
      center: "Center",
      addField: "Add field",
      expandSubtree: "Expand subtree",
      collapseSubtree: "Collapse subtree",
      edgeFocused: "Connection in focus",
      none: "No selected item",
      transitionInFocus: "Transition in focus",
      semanticAttention: "Semantic: attention",
      semanticWarning: "Semantic: warning",
      semanticSuggestion: "Semantic: suggestion",
      semanticInfo: "Semantic: info",
      semanticOk: "Semantic: OK",
      technicalKind: " (kind: {kind})",
    },
    inlineRename: {
      label: "Rename node",
    },
    addNode: {
      roleLabelFlow: "Flow role",
      roleLabelDefault: "Node role",
      titleLabelGraph: "Item name",
      titleLabelFlow: "Visible flow name",
      titleLabelDefault: "Title",
      titlePlaceholder: "E.g. {title}",
      descriptionLabelFlow: "Operational reading (optional)",
      descriptionLabelDefault: "Description (optional)",
      tagsLabelFlow: "Operational tags (optional)",
      tagsLabelDefault: "Tags (optional)",
      tagsPlaceholder: "E.g. onboarding, approval",
    },
    quickRelate: {
      title: "Relate entities",
    },
    semanticOverride: {
      ariaLabel: "Technical override",
      complianceHint:
        "The technical override records a reason for audit and compliance.",
      reasonLabel: "Reason",
      reasonRequiredSuffix: " required (minimum {min} characters)",
      reasonOptionalSuffix: " (optional)",
      placeholder: "Describe the technical reason for the override.",
      apply: "Apply override",
    },
    inspector: {
      ariaLabel: "Inspector",
      currentRole: "Current role:",
      dominantReading: "Dominant reading",
      draftBadge: "Draft not applied",
      hide: "Hide inspector",
      modeAria: "Inspector mode",
      modeOperational: "Operational",
      modeTechnical: "Technical",
      neighborhood: "Neighborhood",
      neighborhoodSummary: "{incomingCount} incoming and {outgoingCount} outgoing",
      outOfProfileSuffix: " (out of profile)",
      show: "Show inspector",
      subtitle: {
        noneSelected: "Select a node or relationship to inspect.",
        graphEdge: "Read the network connection and adjust the technical context.",
        flowEdge: "Review the transition before changing its reading.",
        defaultEdge: "Adjust the details of the selected connection.",
        graphNode: "Understand the component's role in the network before editing.",
        flowNode: "Review the process segment and then refine its details.",
        sitemap: "Review this item's navigation and hierarchy.",
        tree: "Review this node's structural role.",
        erd: "Adjust the entity, fields and relationships with consistency in mind.",
        timeline: "Review the milestone and its temporal connection.",
        mindmap: "Adjust the topic, context and related connections.",
        defaultNode: "Review the context and details of the selected node.",
      },
    },
    audit: {
      ariaLabel: "Semantic validation",
      title: "Semantic validation",
      summary: "{total} item(s), {errors} error(s)",
      applyAllSafeFixes: "Apply all safe fixes",
      goToIssue: "Go to",
      empty: "No semantic inconsistencies found.",
      collapsedHint: "Open to review validations and focus the affected items.",
    },
    graph: {
      readingTitle: "Network reading",
      networkPosition: "Network position",
      edgeReadingTitle: "Connection reading",
    },
    layoutPolicy: {
      allowed: "Layout allowed",
      blocked: "Layout blocked",
      blockedDescription:
        "This map was frozen by the assistant. Reopen the creation flow to change the policy.",
      blockedTooltip:
        "The assistant marked this snapshot so layout should not be automatically reapplied.",
    },
    diagram: {
      current: "Current diagram: {diagramType}",
      pending: "Pending diagram type",
    },
    saveStatus: {
      error: "Save failed.",
    },
    relations: {
      incoming: "Incoming",
      outgoing: "Outgoing",
      graphIncoming: "Receives from",
      graphOutgoing: "Sends to",
      graphSummary:
        "{incomingCount} incoming and {outgoingCount} outgoing network connection(s).",
      flowSummary:
        "{incomingCount} previous and {outgoingCount} next transition(s).",
      openComponent: "Open component",
      openRelatedNode: "Open related item",
      editConnection: "Edit connection",
      emptyGraph: "No connection was found for this component.",
      empty: "No relationship was found for this item.",
    },
    nodeFields: {
      title: "Title",
      graphTitle: "Component name",
      kind: "Type",
      graphKind: "Network role",
      description: "Description",
      graphDescription: "Architecture reading",
      descriptionPlaceholder: "Describe this item in operational language.",
      graphDescriptionPlaceholder:
        "Describe the main technical responsibility, boundary or dependency.",
      tags: "Tags",
      graphTags: "Architecture tags",
      tagsPlaceholder: "E.g. owner, priority, channel",
      graphTagsPlaceholder: "E.g. core, adapter, risk, integration",
      tagsHelper: "Use short tags for context, group or criticality.",
      graphTagsHelper:
        "Use short tags for boundary, dependency, domain or risk.",
      contextTitle: "Context",
      graphContextTitle: "Architecture reading",
    },
    edgeFields: {
      label: "Label",
      graphLabel: "Connection verb",
      kind: "Link type",
      graphKind: "Connection semantics",
      source: "Source",
      graphSource: "Source component",
      target: "Target",
      graphTarget: "Target component",
    },
    sections: {
      general: "General",
      details: "Details",
      relations: "Relationships",
      graphGeneral: "Primary reading",
      graphDetails: "Network context",
      graphRelations: "Connectivity",
      graphEdgeGeneral: "Connection reading",
    },
    technical: {
      generalSection: "General",
      detailsSection: "Details",
      advancedSection: "Advanced",
      node: {
        label: "Label",
        rawKind: "Raw kind",
        dataJson: "Data (JSON)",
      },
      edge: {
        label: "Label",
        rawKind: "Raw kind",
        dataJson: "Data (JSON)",
      },
      formatJson: "Format JSON",
      copyJson: "Copy JSON",
      copyId: "Copy ID",
      friendlyLabel: "Friendly label: {label}",
      position: "Position",
      link: "Link",
    },
    metadata: {
      description:
        "Editor working snapshot with incremental saving, layout and versions.",
      visualMode: "Visual mode: {mode}",
      changeInAssistant: "Change in assistant",
      layoutPolicy: "Layout policy: {policy}",
      toggleOpen: "Hide metadata",
      toggleClosed: "Show metadata ({count} nodes)",
      workingSnapshot: "Working snapshot",
      counts: "{pendingCount} pending, {nodeCount} node(s), {edgeCount} edge(s)",
      lastSavedAt: "Last saved: {time}",
      rendererMismatch:
        "The visual renderer does not match the persisted diagram type.",
    },
    prisma: {
      ariaLabel: "Prisma import",
      title: "Import Prisma schema",
      description:
        "Use this area to generate entities and relationships from a Prisma schema.",
      import: "Import schema",
      importing: "Importing schema...",
      overwriteWarning:
        "The import adds and adjusts the current snapshot. Review it before saving a new version.",
      toggleOpen: "Hide Prisma import",
      toggleClosed: "Show Prisma import",
      saved: "Prisma schema imported into the working snapshot.",
      synced: "Snapshot synced after the Prisma import.",
      feedbackSuccess:
        "Prisma schema imported successfully into the working snapshot.",
      feedbackSuccessWithCounts:
        "Prisma schema imported successfully ({modelsCount} model(s), {relationsCount} relation(s), {scalarFieldsCount} scalar field(s)).",
      errors: {
        emptySchema: "Paste a Prisma schema before importing.",
        import: "The Prisma schema could not be imported.",
      },
    },
    versions: {
      ariaLabel: "Snapshot versions",
      title: "Versions",
      description:
        "Compare, name and restore saved project snapshots.",
      toggleOpen: "Hide versions",
      toggleClosed: "Show versions ({count})",
      refresh: "Refresh list",
      refreshing: "Refreshing...",
      refreshSuccess: "{count} version(s) loaded.",
      newVersionNameAria: "New version name",
      newVersionNamePlaceholder: "E.g. baseline before review",
      create: "Create version",
      creating: "Creating version...",
      summaryTitle: "Executive summary",
      empty: "No versions recorded yet.",
      originLabel: "Origin: {origin}",
      localNameHint:
        "Local names help you identify a version quickly in your browser.",
      localNameLabel: "Local name",
      localNamePlaceholder: "E.g. team-approved version",
      localNameDescription:
        "This name is stored only in your browser for quick reference.",
      saveName: "Save name",
      localNameSaved: "Local name saved.",
      localNameRemoved: "Local name removed.",
      unnamed: "Unnamed",
      compare: "Compare",
      comparing: "Comparing...",
      restore: "Restore",
      restoring: "Restoring...",
      restoreSaved: "Version restored into the working snapshot.",
      restoreSynced: "Snapshot synced with the restored version.",
      changedBreakdown:
        "{renamed} renamed, {kindChanged} kind change(s), {payloadChanged} payload change(s).",
      topChangesTitle: "Top changes",
      cards: {
        nodesAdded: "Nodes added",
        nodesRemoved: "Nodes removed",
        nodesChanged: "Nodes changed",
        edgesChanged: "Edges changed",
      },
      origin: {
        manual: "Manual",
      },
      diff: {
        noChanges:
          "No changes between the selected version and the working snapshot.",
        nodesAdded: "{count} node(s) added",
        nodesRemoved: "{count} node(s) removed",
        nodesChanged: "{count} node(s) changed",
        edgesAdded: "{count} edge(s) added",
        edgesRemoved: "{count} edge(s) removed",
        edgesChanged: "{count} edge(s) changed",
        viewportChanged: "viewport changed",
        summary: "Summary: {parts}.",
      },
      errors: {
        saveBeforeCreate:
          "Save or finish the pending save before creating a version.",
        create: "The version could not be created.",
        refresh: "The version list could not be refreshed.",
        compare: "The selected version could not be compared.",
        restore: "The selected version could not be restored.",
        load: "The project versions could not be loaded.",
      },
    },
    erd: {
      badges: {
        noPk: "No PK",
        fkPending: "Pending FK",
        nnSuggestsAssociative: "N:N suggests associative",
      },
      exportPreviewSuccess: "ERD export preview generated successfully.",
      exportBlockedStrict:
        "ERD export was blocked by the policy strict mode.",
      exportBlockedStrictWithSafeFixes:
        "ERD export was blocked. Apply the safe fixes before exporting.",
      entity: {
        badge: "Entity (ERD)",
        nameLabel: "Entity name",
        tableNameLabel: "Table name (optional)",
        tableNamePlaceholder: "E.g. users",
        descriptionLabel: "Description (optional)",
        grid: {
          name: "Name",
          type: "Type",
          flags: "Flags",
          actions: "Actions",
        },
        addField: "+ Field",
        keyboardHint:
          "Press Enter to create a new field. Row shortcuts: P (PK), F (FK), U (UQ), N (NOT_NULL).",
      },
      relation: {
        badge: "Relationship (ERD)",
        sections: {
          general: "General",
          cardinality: "Cardinality",
          roles: "Roles",
          materialization: "Materialization",
          referentialIntegrity: "Referential integrity",
          diagnostics: "Diagnostics",
        },
        nameLabel: "Relationship name",
        optionalPlaceholder: "Optional",
        descriptionLabel: "Description",
        source: "Source",
        target: "Target",
        swapDirection: "Swap direction",
        minSource: "Source min",
        maxSource: "Source max",
        minTarget: "Target min",
        maxTarget: "Target max",
        optionalSource: "Optional source",
        optionalTarget: "Optional target",
        roleFallback: "relates",
        currentState: "Current state:",
        dependentSide: "Dependent side",
        fkField: "FK field",
        createNewField: "Create new field",
        uniqueOnFk: "Apply UNIQUE on FK",
        materializeFk: "Materialize as FK",
        applyUnique: "Apply UNIQUE (1:1)",
        convertAssociative: "Convert to associative",
        markConceptual: "Mark as conceptual",
        defaultOption: "(default)",
        diagnosticsEmpty: "No diagnostics for this relationship.",
        remove: "Remove relationship",
        materialization: {
          fk: "Materialized FK",
          associative: "Associative table",
          conceptual: "Conceptual",
        },
      },
    },
    errors: {
      applyChange: "The change could not be applied.",
      saveChanges: "Pending changes could not be saved.",
      saveSnapshot: "The working snapshot could not be saved.",
      connectionNodesNotFound:
        "The nodes involved in the connection could not be found on the canvas.",
      createTransitionOnServer:
        "The transition could not be created on the server.",
      createRelationOnServer:
        "The relationship could not be created on the server.",
      invalidConnectionForDiagram:
        "The selected connection is not allowed for this diagram type.",
      serverSemanticAudit:
        "The semantic validation could not be run on the server.",
      copySelection: "The selection could not be copied.",
      pasteSelection: "The selection could not be pasted.",
      cutSelection: "The selection could not be cut.",
      duplicateSelection: "The selection could not be duplicated.",
      selectErdEntityToEdit:
        "Select an ERD entity to edit its fields and properties.",
      selectErdEntityToAddField:
        "Select an ERD entity before adding a field.",
      applySuggestedFix: "The suggested fix could not be applied.",
      applySafeFixes: "The safe fixes could not be applied.",
      updateErdValidation:
        "The ERD validation level could not be updated.",
      erdExportOnly:
        "Export preview is available only for ERD diagrams.",
      erdExportPreview: "The ERD export preview could not be generated.",
      quickRelationEntityNotFound:
        "The selected entities for quick relationship could not be found.",
      createQuickRelation: "The quick relationship could not be created.",
      finishPendingSaveBeforeRelation:
        "Finish the pending save before creating or changing relationships.",
      semanticOverrideReasonRequired:
        "Provide a reason with at least {min} characters to apply the override.",
      applySemanticOverride: "The technical override could not be applied.",
      clipboardUnavailable:
        "The clipboard API is not available in this browser/context.",
      pasteBlockedByPolicy:
        "Paste was blocked by semantic rules or diagram policy.",
      validatePasteWithBackend:
        "The paste content could not be validated with the backend.",
      duplicateCurrentSelection:
        "The current selection could not be duplicated.",
      invalidClipboardFragment:
        "The clipboard content does not contain a valid MapIA fragment.",
      layoutBlockedByAssistant:
        "The assistant blocked layout reapplication for this snapshot.",
      organizeRequiresSupportedType:
        "Automatic organization requires a supported diagram type.",
      reapplyLayoutRequiresSupportedType:
        "The layout could not be reapplied because the diagram type is not supported.",
      invalidJsonFormat: "Invalid JSON. Fix the structure before continuing.",
      copyNodeId: "The node ID could not be copied.",
      copyEdgeId: "The edge ID could not be copied.",
      copyJson: "The JSON could not be copied.",
      finishPendingSaveBeforeApply:
        "Finish the pending save before applying these changes.",
    },
    messages: {
      transitionRemoved: "Transition removed.",
      relationRemoved: "Relationship removed.",
      transitionAutoAdjusted: "Transition automatically adjusted to {nextKind}.",
      relationAutoAdjusted:
        "Relationship automatically adjusted to {nextKind}.",
      auditCompleted: "Validation completed with {count} item(s).",
      titleUpdated: "Title updated.",
      fieldAdded: "Field {fieldName} added to {entityName}.",
      connectionCancelled: "Connection creation cancelled.",
      fixApplied: "{applied} of {total} fix(es) applied.",
      noSafeFixes: "No safe fixes are available.",
      safeFixesApplied: "{applied} of {total} safe fix(es) applied.",
      erdValidationLevelUpdated:
        "ERD validation level updated to {level}.",
      relationDirectionSwapped: "Relationship direction swapped.",
      relationMaterializedExistingField:
        "Relationship materialized using an existing field.",
      quickRelationCreatedSuggestAssociative:
        "N:N relationship created. Consider materializing it with an associative table.",
      quickRelationConvertedAssociative:
        "N:N relationship created and converted to an associative table.",
      quickRelationSuggestMaterialize:
        "Relationship created. Consider materializing the FK in {dependentLabel} referencing {referencedLabel}.",
      quickRelationMaterializedAutomatically:
        "Relationship created and materialized automatically.",
      kindChangeCancelled: "Kind change cancelled.",
      nodeUpdatedAutosaveQueued:
        "Update applied. Autosave has been queued.",
      kindAppliedWithRepair: "Kind updated with {count} applied repair(s).",
      kindAppliedWithRemoval:
        "Kind updated with {count} applied removal(s).",
      selectionCopied: "Selection copied.",
      selectionCut: "Selection cut.",
      duplicateCompleted:
        "Duplication completed: {nodes} node(s), {edges} edge(s), {skippedEdges} skipped edge(s).",
      pasteCompleted:
        "Paste completed: {nodes} node(s), {edges} edge(s), {skippedEdges} skipped edge(s).",
      diagramAlreadyOrganized:
        "The diagram was already organized for the current layout.",
      organizeApplied: "Organization applied to {count} node(s).",
      layoutAlreadyConsistent:
        "The current layout is already consistent with the configured rules.",
      layoutReapplied: "Layout reapplied to {count} node(s).",
      layoutReappliedGeneric: "Layout reapplied to the current snapshot.",
      jsonFormatted: "JSON formatted.",
      idCopied: "ID copied.",
      jsonCopied: "JSON copied.",
      nodeUpdatedSynced: "Node updated and synced.",
      nodeUpdatedWithOverride:
        "Node updated with a recorded technical override.",
      edgeUpdatedSynced: "Connection updated and synced.",
      edgeUpdatedWithOverride:
        "Connection updated with a recorded technical override.",
    },
    sync: {
      syncing: "Syncing...",
      initialIgnored:
        "A remote snapshot was detected, but the initial sync was ignored because local pending changes exist.",
      snapshotSynced: "Snapshot synced with the backend.",
      errors: {
        snapshot: "The editor snapshot could not be synchronized.",
      },
    },
    emptyState: {
      title: "No item selected on the canvas.",
      summary:
        "Select a node or edge to review titles, relationships and details.",
      guidance:
        "To start editing, select an element in the diagram or add a new node from the top bar.",
      nodes: "Nodes",
      edges: "Edges",
      viewport: "Viewport",
    },
    edgeActions: {
      remove: "Remove",
    },
  },
} as const;

export default enUSEditorShellMessages;
