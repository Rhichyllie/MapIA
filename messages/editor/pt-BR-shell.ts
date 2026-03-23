export const ptBREditorShellMessages = {
  shell: {
    canvasAriaLabel: "Canvas do editor",
    rendererLabels: {
      tree: "Hierarquia",
      flow: "Fluxo",
      sitemap: "Sitemap",
      erd: "ERD",
      graph: "Grafo",
      timeline: "Timeline",
      mindmap: "Mapa mental",
    },
    topBar: {
      quickFind: "Buscar (Ctrl+K)",
      fitView: "Ajustar",
      organize: "Organizar",
      showValidation: "Verificar",
      hideValidation: "Ocultar verificacao",
      erdValidationLevel: "Validacao ERD",
      exportPreview: "Gerar/Exportar (preview)",
      exportPreviewGenerating: "Gerando preview...",
      enterFocus: "Entrar em foco",
      exitFocus: "Sair do foco",
    },
    buttons: {
      removeSelected: "Remover selecionado",
      save: "Salvar",
      reapplyLayout: "Reaplicar layout",
    },
    common: {
      cancel: "Cancelar",
      save: "Salvar",
    },
    selection: {
      openTransition: "Editar transicao",
      openInspector: "Editar no inspetor",
      edit: "Editar",
      center: "Centralizar",
      addField: "Adicionar campo",
      expandSubtree: "Expandir subarvore",
      collapseSubtree: "Colapsar subarvore",
      edgeFocused: "Conexao em foco",
      none: "Nenhum item selecionado",
      transitionInFocus: "Transicao em foco",
      semanticAttention: "Semantica: atencao",
      semanticWarning: "Semantica: aviso",
      semanticSuggestion: "Semantica: sugestao",
      semanticInfo: "Semantica: info",
      semanticOk: "Semantica: OK",
      technicalKind: " (kind: {kind})",
    },
    inlineRename: {
      label: "Renomear no",
    },
    addNode: {
      roleLabelFlow: "Papel no fluxo",
      roleLabelDefault: "Papel do no",
      titleLabelGraph: "Nome do item",
      titleLabelFlow: "Nome visivel no fluxo",
      titleLabelDefault: "Titulo",
      titlePlaceholder: "Ex.: {title}",
      descriptionLabelFlow: "Leitura operacional (opcional)",
      descriptionLabelDefault: "Descricao (opcional)",
      tagsLabelFlow: "Marcadores operacionais (opcional)",
      tagsLabelDefault: "Tags (opcional)",
      tagsPlaceholder: "Ex.: onboarding, aprovacao",
    },
    quickAdd: {
      roles: {
        hierarchyRoot: {
          label: "No raiz",
          description: "Marca o ponto principal da estrutura.",
        },
        hierarchyNode: {
          label: "No hierarquico",
          description: "Organiza conteudo em niveis relacionados.",
        },
        sitemapHome: {
          label: "Home",
          description: "Pagina inicial da navegacao.",
        },
        sitemapSection: {
          label: "Secao",
          description: "Secao navegavel ligada a uma area do mapa.",
        },
        timelineMilestone: {
          label: "Marco",
          description: "Evento ou entrega que marca a linha do tempo.",
        },
      },
    },
    quickRelate: {
      title: "Relacionar entidades",
    },
    connection: {
      invalidRules: "Conexao invalida para as regras do diagrama.",
    },
    repair: {
      summaryFallback:
        "A troca de tipo exige reparo para manter consistencia.",
      updateRelation: "Atualizar relacao {edgeId} para {nextKind}.",
      removeInvalidRelation: "Remover relacao invalida {edgeId}.",
      adjustNodeKind: "Ajustar o no para {nextKind}.",
    },
    semanticOverride: {
      ariaLabel: "Override tecnico",
      complianceHint:
        "O override tecnico registra justificativa para auditoria e compliance.",
      reasonLabel: "Justificativa",
      reasonRequiredSuffix: " obrigatoria (minimo {min} caracteres)",
      reasonOptionalSuffix: " (opcional)",
      placeholder: "Descreva o motivo tecnico do override.",
      apply: "Aplicar override",
    },
    inspector: {
      ariaLabel: "Inspetor",
      confirmDiscardDraft:
        "Existem alteracoes nao aplicadas neste inspetor. Deseja descartalas?",
      currentRole: "Papel atual:",
      dominantReading: "Leitura dominante",
      draftBadge: "Rascunho nao aplicado",
      hide: "Ocultar inspetor",
      modeAria: "Modo do inspetor",
      modeOperational: "Operacional",
      modeTechnical: "Tecnico",
      neighborhood: "Vizinhanca",
      neighborhoodSummary:
        "{incomingCount} entrada(s) e {outgoingCount} saida(s)",
      outOfProfileSuffix: " (fora do perfil)",
      show: "Exibir inspetor",
      subtitle: {
        noneSelected: "Selecione um no ou relacao para inspecionar.",
        graphEdge: "Leia a conexao da rede e ajuste o contexto tecnico.",
        flowEdge: "Revise a transicao antes de alterar sua leitura.",
        defaultEdge: "Ajuste os detalhes da conexao selecionada.",
        graphNode: "Entenda o papel do componente na rede antes de editar.",
        flowNode: "Revise o trecho do processo e depois refine os detalhes.",
        sitemap: "Revise a navegacao e a hierarquia deste item.",
        tree: "Revise o papel estrutural deste no.",
        erd: "Ajuste entidade, campos e relacoes com foco em consistencia.",
        timeline: "Revise o marco e a ligacao temporal deste item.",
        mindmap: "Ajuste o tema, contexto e conexoes relacionadas.",
        defaultNode: "Revise o contexto e os detalhes do no selecionado.",
      },
    },
    audit: {
      ariaLabel: "Verificacao semantica",
      title: "Verificacao semantica",
      summary: "{total} item(ns), {errors} erro(s)",
      applyAllSafeFixes: "Corrigir tudo seguro",
      goToIssue: "Ir para",
      empty: "Nenhuma inconsistencia semantica detectada.",
      collapsedHint:
        "Abra para navegar pelas validacoes e focar os itens.",
    },
    graph: {
      readingTitle: "Leitura da rede",
      networkPosition: "Posicao na rede",
      edgeReadingTitle: "Leitura da conexao",
    },
    layoutPolicy: {
      allowed: "Layout liberado",
      blocked: "Layout bloqueado",
      blockedDescription:
        "Este mapa foi congelado pelo Assistente. Reabra o fluxo de criacao para alterar a politica.",
      blockedTooltip:
        "O Assistente marcou este snapshot para nao reaplicar layout automaticamente.",
    },
    diagram: {
      current: "Diagrama atual: {diagramType}",
      pending: "Tipo de diagrama pendente",
    },
    roles: {
      metaWorkspace: "Workspace",
      metaProject: "Projeto",
      treeRoot: "Raiz",
      treeNode: "No de hierarquia",
      hierarchyRoot: "No raiz",
      hierarchyNode: "No hierarquico",
      sitemapHome: "Pagina Home",
      sitemapSection: "Secao navegavel",
      mindmapRoot: "Tema central",
      mindmapBranch: "Ramificacao",
      mindmapReference: "Referencia",
      graphCore: "Nucleo da rede",
      graphTopic: "Componente conectado",
      graphSupporting: "Apoio arquitetural",
      timelineMilestone: "Marco temporal",
      erdEntity: "Entidade",
      erdComment: "Comentario ERD",
      undefined: "Sem papel definido",
    },
    structureTips: {
      treeSitemapFocus: "Foco em pai, filhos, nivel e ordem.",
      treeSitemapCurrent:
        "Leitura atual: {childCount} filho(s) e profundidade {depth}.",
      erd: "Foco em campos, chaves e cardinalidade.",
      mindmap: "Foco em ramificacoes e temas relacionados.",
      timeline: "Foco em marcos, dependencias e sequencia temporal.",
      default: "Foco em contexto e conexoes principais.",
    },
    semanticSeverity: {
      error: "Erro",
      warning: "Aviso",
      suggestion: "Sugestao",
      info: "Info",
    },
    saveStatus: {
      error: "Falha ao salvar.",
    },
    relations: {
      incoming: "Entrada",
      outgoing: "Saida",
      graphIncoming: "Recebe de",
      graphOutgoing: "Envia para",
      graphSummary:
        "{incomingCount} conexao(oes) de entrada e {outgoingCount} de saida na rede.",
      flowSummary:
        "{incomingCount} passagem(ns) anteriores e {outgoingCount} seguintes.",
      openComponent: "Abrir componente",
      openRelatedNode: "Abrir relacionado",
      editConnection: "Editar conexao",
      emptyGraph: "Nenhuma conexao encontrada para este componente.",
      empty: "Nenhuma relacao encontrada para este item.",
    },
    nodeFields: {
      title: "Titulo",
      graphTitle: "Nome do componente",
      kind: "Tipo",
      graphKind: "Papel na rede",
      description: "Descricao",
      graphDescription: "Leitura arquitetural",
      descriptionPlaceholder: "Descreva este item em linguagem operacional.",
      graphDescriptionPlaceholder:
        "Descreva a responsabilidade tecnica, fronteira ou dependencia principal.",
      tags: "Tags",
      graphTags: "Marcadores arquiteturais",
      tagsPlaceholder: "Ex.: responsavel, prioridade, canal",
      graphTagsPlaceholder: "Ex.: core, adaptador, risco, integracao",
      tagsHelper: "Use tags curtas para contexto, grupo ou criticidade.",
      graphTagsHelper:
        "Use tags curtas para fronteira, dependencia, dominio ou risco.",
      contextTitle: "Contexto",
      graphContextTitle: "Leitura arquitetural",
    },
    edgeFields: {
      label: "Rotulo",
      graphLabel: "Verbo da conexao",
      kind: "Tipo de ligacao",
      graphKind: "Semantica da conexao",
      source: "Origem",
      graphSource: "Componente de origem",
      target: "Destino",
      graphTarget: "Componente de destino",
    },
    sections: {
      general: "Geral",
      details: "Detalhes",
      relations: "Relacoes",
      graphGeneral: "Leitura principal",
      graphDetails: "Contexto da rede",
      graphRelations: "Conectividade",
      graphEdgeGeneral: "Leitura da conexao",
    },
    technical: {
      generalSection: "Geral",
      detailsSection: "Detalhes",
      advancedSection: "Avancado",
      node: {
        label: "Rotulo",
        rawKind: "Kind (raw)",
        dataJson: "Dados (JSON)",
      },
      edge: {
        label: "Rotulo",
        rawKind: "Kind (raw)",
        dataJson: "Dados (JSON)",
      },
      formatJson: "Formatar JSON",
      copyJson: "Copiar JSON",
      copyId: "Copiar ID",
      friendlyLabel: "Label amigavel: {label}",
      position: "Posicao",
      link: "Ligacao",
    },
    metadata: {
      description:
        "Snapshot de trabalho do editor com salvamento incremental, layout e versoes.",
      visualMode: "Modo visual: {mode}",
      changeInAssistant: "Alterar no Assistente",
      layoutPolicy: "Politica de layout: {policy}",
      toggleOpen: "Ocultar metadados",
      toggleClosed: "Exibir metadados ({count} nos)",
      workingSnapshot: "Snapshot de trabalho",
      counts:
        "{pendingCount} pendencia(s), {nodeCount} no(s), {edgeCount} aresta(s)",
      lastSavedAt: "Ultimo salvamento: {time}",
      rendererMismatch:
        "O renderer visual nao corresponde ao tipo de diagrama persistido.",
    },
    prisma: {
      ariaLabel: "Importacao de Prisma",
      title: "Importar schema Prisma",
      description:
        "Use esta area para gerar entidades e relacoes a partir de um schema Prisma.",
      import: "Importar schema",
      importing: "Importando schema...",
      overwriteWarning:
        "A importacao adiciona e ajusta o snapshot atual. Revise antes de salvar uma nova versao.",
      toggleOpen: "Ocultar importacao Prisma",
      toggleClosed: "Exibir importacao Prisma",
      confirmImport:
        "Importar o schema Prisma e aplicar as mudancas no snapshot atual?",
      confirmImportDiscard:
        "Existem alteracoes pendentes. Importar o schema Prisma e substituir o contexto atual?",
      saved: "Schema Prisma importado no snapshot de trabalho.",
      synced: "Snapshot sincronizado apos a importacao do Prisma.",
      feedbackSuccess:
        "Schema Prisma importado com sucesso para o snapshot de trabalho.",
      feedbackSuccessWithCounts:
        "Schema Prisma importado com sucesso ({modelsCount} modelo(s), {relationsCount} relacao(oes), {scalarFieldsCount} campo(s) escalar(es)).",
      errors: {
        emptySchema: "Cole um schema Prisma antes de importar.",
        import: "Nao foi possivel importar o schema Prisma.",
      },
    },
    versions: {
      ariaLabel: "Versoes do snapshot",
      title: "Versoes",
      description:
        "Compare, nomeie e restaure snapshots salvos do projeto.",
      toggleOpen: "Ocultar versoes",
      toggleClosed: "Exibir versoes ({count})",
      refresh: "Atualizar lista",
      refreshing: "Atualizando...",
      refreshSuccess: "{count} versao(oes) carregadas.",
      newVersionNameAria: "Nome da nova versao",
      newVersionNamePlaceholder: "Ex.: baseline antes da revisao",
      create: "Criar versao",
      creating: "Criando versao...",
      summaryTitle: "Resumo executivo",
      empty: "Nenhuma versao registrada ainda.",
      originLabel: "Origem: {origin}",
      localNameHint:
        "Nomes locais ajudam a identificar rapidamente uma versao no seu navegador.",
      localNameLabel: "Nome local",
      localNamePlaceholder: "Ex.: versao aprovada pelo time",
      localNameDescription:
        "Esse nome fica apenas no seu navegador para consulta rapida.",
      saveName: "Salvar nome",
      localNameSaved: "Nome local salvo.",
      localNameRemoved: "Nome local removido.",
      unnamed: "Sem nome",
      compare: "Comparar",
      comparing: "Comparando...",
      restore: "Restaurar",
      restoring: "Restaurando...",
      confirmRestore:
        "Restaurar a versao selecionada no snapshot de trabalho?",
      confirmRestoreDiscard:
        "Existem alteracoes pendentes. Restaurar esta versao e descartar o que nao foi salvo?",
      restoreSaved: "Versao restaurada no snapshot de trabalho.",
      restoreSynced: "Snapshot sincronizado com a versao restaurada.",
      changedBreakdown:
        "{renamed} renomeado(s), {kindChanged} tipo(s) alterado(s), {payloadChanged} payload(s) alterado(s).",
      topChangesTitle: "Principais mudancas",
      cards: {
        nodesAdded: "Nos adicionados",
        nodesRemoved: "Nos removidos",
        nodesChanged: "Nos alterados",
        edgesChanged: "Arestas alteradas",
      },
      origin: {
        manual: "Manual",
      },
      diff: {
        noChanges:
          "Sem alteracoes entre a versao selecionada e o snapshot de trabalho.",
        nodesAdded: "{count} no(s) adicionados",
        nodesRemoved: "{count} no(s) removidos",
        nodesChanged: "{count} no(s) alterados",
        edgesAdded: "{count} aresta(s) adicionadas",
        edgesRemoved: "{count} aresta(s) removidas",
        edgesChanged: "{count} aresta(s) alteradas",
        viewportChanged: "viewport alterado",
        summary: "Resumo: {parts}.",
      },
      errors: {
        saveBeforeCreate:
          "Salve ou conclua o salvamento pendente antes de criar uma versao.",
        create: "Nao foi possivel criar a versao.",
        refresh: "Nao foi possivel atualizar a lista de versoes.",
        compare: "Nao foi possivel comparar a versao selecionada.",
        restore: "Nao foi possivel restaurar a versao selecionada.",
        load: "Nao foi possivel carregar as versoes do projeto.",
      },
    },
    erd: {
      badges: {
        noPk: "Sem PK",
        fkPending: "FK pendente",
        nnSuggestsAssociative: "N:N sugere associativa",
      },
      exportPreviewSuccess:
        "Preview de exportacao ERD gerado com sucesso.",
      exportBlockedStrict:
        "A exportacao ERD foi bloqueada pelo modo estrito da politica.",
      exportBlockedStrictWithSafeFixes:
        "A exportacao ERD foi bloqueada. Aplique as correcoes seguras antes de exportar.",
      entity: {
        badge: "Entidade (ERD)",
        nameLabel: "Nome da entidade",
        tableNameLabel: "Nome da tabela (opcional)",
        tableNamePlaceholder: "Ex.: users",
        descriptionLabel: "Descricao (opcional)",
        grid: {
          name: "Nome",
          type: "Tipo",
          flags: "Flags",
          actions: "Acoes",
        },
        addField: "+ Campo",
        keyboardHint:
          "Enter cria novo campo. Atalhos por linha: P (PK), F (FK), U (UQ), N (NOT_NULL).",
      },
      relation: {
        badge: "Relacao (ERD)",
        sections: {
          general: "Geral",
          cardinality: "Cardinalidade",
          roles: "Papeis",
          materialization: "Materializacao",
          referentialIntegrity: "Integridade referencial",
          diagnostics: "Diagnosticos",
        },
        nameLabel: "Nome da relacao",
        optionalPlaceholder: "Opcional",
        descriptionLabel: "Descricao",
        source: "Origem",
        target: "Destino",
        swapDirection: "Trocar direcao",
        minSource: "Min origem",
        maxSource: "Max origem",
        minTarget: "Min destino",
        maxTarget: "Max destino",
        optionalSource: "Origem opcional",
        optionalTarget: "Destino opcional",
        roleFallback: "relaciona",
        currentState: "Estado atual:",
        dependentSide: "Lado dependente",
        fkField: "Campo FK",
        createNewField: "Criar novo campo",
        uniqueOnFk: "Aplicar UNIQUE no FK",
        materializeFk: "Materializar como FK",
        applyUnique: "Aplicar UNIQUE (1:1)",
        convertAssociative: "Converter em associativa",
        markConceptual: "Marcar como conceitual",
        defaultOption: "(padrao)",
        diagnosticsEmpty: "Sem diagnosticos para esta relacao.",
        remove: "Remover relacao",
        materialization: {
          fk: "FK materializada",
          associative: "Tabela associativa",
          conceptual: "Conceitual",
        },
      },
    },
    errors: {
      applyChange: "Nao foi possivel aplicar a alteracao.",
      saveChanges: "Nao foi possivel salvar as alteracoes pendentes.",
      saveSnapshot: "Nao foi possivel salvar o snapshot de trabalho.",
      connectionNodesNotFound:
        "Os nos envolvidos na conexao nao foram encontrados no canvas.",
      createTransitionOnServer:
        "Nao foi possivel criar a transicao no servidor.",
      createRelationOnServer:
        "Nao foi possivel criar a relacao no servidor.",
      invalidConnectionForDiagram:
        "A conexao selecionada nao e permitida para este tipo de diagrama.",
      serverSemanticAudit:
        "Nao foi possivel executar a verificacao semantica no servidor.",
      copySelection: "Nao foi possivel copiar a selecao.",
      pasteSelection: "Nao foi possivel colar a selecao.",
      cutSelection: "Nao foi possivel recortar a selecao.",
      duplicateSelection: "Nao foi possivel duplicar a selecao.",
      selectErdEntityToEdit:
        "Selecione uma entidade ERD para editar os campos e propriedades.",
      selectErdEntityToAddField:
        "Selecione uma entidade ERD antes de adicionar um campo.",
      applySuggestedFix: "Nao foi possivel aplicar a correcao sugerida.",
      applySafeFixes: "Nao foi possivel aplicar as correcoes seguras.",
      updateErdValidation:
        "Nao foi possivel atualizar o nivel de validacao ERD.",
      erdExportOnly:
        "A exportacao preview esta disponivel apenas para diagramas ERD.",
      erdExportPreview: "Nao foi possivel gerar o preview de exportacao ERD.",
      quickRelationEntityNotFound:
        "Nao foi possivel localizar as entidades selecionadas para a relacao rapida.",
      createQuickRelation: "Nao foi possivel criar a relacao rapida.",
      finishPendingSaveBeforeRelation:
        "Conclua o salvamento pendente antes de criar ou alterar relacoes.",
      semanticOverrideReasonRequired:
        "Informe uma justificativa com ao menos {min} caracteres para aplicar o override.",
      applySemanticOverride: "Nao foi possivel aplicar o override tecnico.",
      clipboardUnavailable:
        "A API de clipboard nao esta disponivel neste navegador/contexto.",
      pasteBlockedByPolicy:
        "A colagem foi bloqueada pelas regras semanticas ou de politica do diagrama.",
      validatePasteWithBackend:
        "Nao foi possivel validar a colagem com o backend.",
      duplicateCurrentSelection:
        "Nao foi possivel duplicar o item selecionado.",
      invalidClipboardFragment:
        "O conteudo do clipboard nao contem um fragmento valido do MapIA.",
      layoutBlockedByAssistant:
        "O Assistente bloqueou a reaplicacao de layout deste snapshot.",
      organizeRequiresSupportedType:
        "A organizacao automatica requer um tipo de diagrama com layout suportado.",
      reapplyLayoutRequiresSupportedType:
        "Nao foi possivel reaplicar o layout porque o tipo do diagrama nao e suportado.",
      invalidJsonFormat: "JSON invalido. Corrija a estrutura antes de continuar.",
      copyNodeId: "Nao foi possivel copiar o ID do no.",
      copyEdgeId: "Nao foi possivel copiar o ID da aresta.",
      copyJson: "Nao foi possivel copiar o JSON.",
      finishPendingSaveBeforeApply:
        "Conclua o salvamento pendente antes de aplicar estas alteracoes.",
    },
    messages: {
      transitionRemoved: "Transicao removida.",
      relationRemoved: "Relacao removida.",
      transitionAutoAdjusted:
        "Transicao ajustada automaticamente para {nextKind}.",
      relationAutoAdjusted:
        "Relacao ajustada automaticamente para {nextKind}.",
      auditCompleted: "Verificacao concluida com {count} item(ns).",
      titleUpdated: "Titulo atualizado.",
      fieldAdded: "Campo {fieldName} adicionado em {entityName}.",
      connectionCancelled: "Criacao de conexao cancelada.",
      fixApplied: "{applied} de {total} ajuste(s) aplicado(s).",
      noSafeFixes: "Nao ha correcoes seguras disponiveis.",
      safeFixesApplied:
        "{applied} de {total} correcao(oes) segura(s) aplicada(s).",
      erdValidationLevelUpdated: "Nivel de validacao ERD atualizado para {level}.",
      relationDirectionSwapped: "Direcao da relacao invertida.",
      relationMaterializedExistingField:
        "Relacao materializada usando um campo existente.",
      quickRelationCreatedSuggestAssociative:
        "Relacao N:N criada. Considere materializar com tabela associativa.",
      quickRelationConvertedAssociative:
        "Relacao N:N criada e convertida para tabela associativa.",
      quickRelationSuggestMaterialize:
        "Relacao criada. Considere materializar FK em {dependentLabel} referenciando {referencedLabel}.",
      quickRelationMaterializedAutomatically:
        "Relacao criada e materializada automaticamente.",
      kindChangeCancelled: "Troca de tipo cancelada.",
      nodeUpdatedAutosaveQueued:
        "Atualizacao aplicada. O salvamento automatico foi enfileirado.",
      kindAppliedWithRepair:
        "Tipo atualizado com {count} reparo(s) aplicado(s).",
      kindAppliedWithRemoval:
        "Tipo atualizado com {count} remocao(oes) aplicada(s).",
      selectionCopied: "Selecao copiada.",
      selectionCut: "Selecao recortada.",
      duplicateCompleted:
        "Duplicacao concluida: {nodes} no(s), {edges} aresta(s), {skippedEdges} aresta(s) ignorada(s).",
      pasteCompleted:
        "Colagem concluida: {nodes} no(s), {edges} aresta(s), {skippedEdges} aresta(s) ignorada(s).",
      diagramAlreadyOrganized:
        "O diagrama ja estava organizado para o layout atual.",
      organizeApplied: "Organizacao aplicada em {count} no(s).",
      layoutAlreadyConsistent:
        "O layout atual ja esta consistente com as regras configuradas.",
      layoutReapplied: "Layout reaplicado em {count} no(s).",
      layoutReappliedGeneric: "Layout reaplicado no snapshot atual.",
      jsonFormatted: "JSON formatado.",
      idCopied: "ID copiado.",
      jsonCopied: "JSON copiado.",
      nodeUpdatedSynced: "No atualizado e sincronizado.",
      nodeUpdatedWithOverride:
        "No atualizado com override tecnico registrado.",
      edgeUpdatedSynced: "Conexao atualizada e sincronizada.",
      edgeUpdatedWithOverride:
        "Conexao atualizada com override tecnico registrado.",
    },
    sync: {
      syncing: "Sincronizando...",
      initialIgnored:
        "Snapshot remoto detectado, mas a sincronizacao inicial foi ignorada por haver mudancas locais pendentes.",
      snapshotSynced: "Snapshot sincronizado com o backend.",
      errors: {
        snapshot: "Nao foi possivel sincronizar o snapshot do editor.",
      },
    },
    emptyState: {
      title: "Nenhum item selecionado no canvas.",
      summary:
        "Selecione um no ou aresta para revisar titulos, relacoes e detalhes.",
      guidance:
        "Para iniciar ajustes: selecione um elemento no diagrama ou adicione um novo no na barra superior.",
      nodes: "Nos",
      edges: "Arestas",
      viewport: "Viewport",
    },
    edgeActions: {
      remove: "Remover",
    },
  },
} as const;

export default ptBREditorShellMessages;
