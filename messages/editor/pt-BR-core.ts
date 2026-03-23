export const ptBREditorCoreMessages = {
  page: {
    title: "Editor visual",
    description:
      "Ambiente de trabalho diario com salvamento, versoes e inspetor tecnico.",
    emptyProjectSelectionDescription:
      "Selecione um projeto na area de trabalho para abrir o editor.",
    emptyProjectSelectionBody:
      "O editor trabalha sobre o snapshot de trabalho persistido do projeto.",
    loadErrorFallback: "Nao foi possivel carregar o editor deste projeto.",
    loadErrorDescription: "Falha ao carregar o projeto solicitado.",
    emptyInitialMapTitle: "Mapa inicial ainda nao criado",
    emptyInitialMapDescription:
      "Execute o Assistente de criacao para gerar o mapa inicial antes de editar.",
    openAssistant: "Abrir Assistente",
  },
  canvasToolbar: {
    toolbarAria: "Ferramentas do canvas",
    zoomOutAria: "Reduzir zoom",
    zoomInAria: "Aumentar zoom",
    centerAria: "Centralizar selecao",
  },
  commandPalette: {
    dialogAria: "Buscar no do canvas",
    label: "Buscar no",
    placeholder: "Digite para localizar por nome",
    emptyState: "Nenhum no encontrado.",
    technicalKind: " (kind: {kind})",
  },
  semantics: {
    connectionAssistant: {
      dialogAria: "Assistente de conexao",
      title: "Conexao invalida",
      attemptLabel: "Tentativa:",
      keyboardHint:
        "Use setas para navegar e Enter para confirmar uma relacao.",
      technicalKind: " (kind: {kind})",
      recommendedBadge: "Recomendado",
      emptyState:
        "Nenhuma relacao valida disponivel para esta conexao.",
      cancel: "Cancelar",
    },
    repairDialog: {
      dialogAria: "Reparo semantico",
      defaultTitle: "Reparo semantico necessario",
      applyRepair: "Aplicar e corrigir",
      applyRemoveInvalid: "Aplicar e remover invalidas",
      cancel: "Cancelar",
    },
  },
  autosave: {
    noPendingChanges: "Sem alteracoes pendentes.",
    pendingChanges: "Alteracoes pendentes.",
    pendingChangesQueued: "Alteracoes pendentes na fila de salvamento.",
    saving: "Salvando...",
    savingChanges: "Salvando alteracoes...",
    savingManually: "Salvando manualmente...",
    saved: "Salvo.",
  },
  inspectorFeedback: {
    defaultValidationMessage: "Nao foi possivel validar o formulario.",
    reviewFields: "Revise os campos com erro.",
    invalidKind: "Tipo invalido.",
    jsonObjectRequired: "Dados devem ser um objeto JSON (chave/valor).",
    invalidJson: "JSON invalido. Verifique chaves, virgulas e aspas.",
    labelRequired: "Rotulo e obrigatorio.",
  },
  presentation: {
    fallbacks: {
      untitled: "Sem titulo",
      untitledNode: "No sem titulo",
      manualSource: "Fonte manual",
    },
    nodeKinds: {
      workspace: {
        labelOperational: "Area de trabalho",
        description: "Contexto raiz de organizacao do projeto.",
      },
      project: {
        labelOperational: "Projeto",
        description: "Escopo principal em edicao.",
      },
      entity: {
        labelOperational: "Entidade",
        description: "Objeto de negocio, dado ou recurso modelado.",
      },
      page: {
        labelOperational: "Secao",
        description: "Secao de conteudo, capitulo ou agrupador hierarquico.",
      },
      "flow-step": {
        labelOperational: "Etapa",
        description: "Passo de processo orientado a fluxo.",
      },
      note: {
        labelOperational: "Nota",
        description: "Anotacao contextual para observacoes e decisoes.",
      },
    },
    edgeKinds: {
      contains: {
        labelOperational: "Contem",
        description: "Relacao de composicao entre pai e filho.",
      },
      references: {
        labelOperational: "Referencia",
        description: "Ligacao de referencia sem dependencia estrutural.",
      },
      "depends-on": {
        labelOperational: "Depende de",
        description: "Dependencia entre itens para execucao ou decisao.",
      },
      "flows-to": {
        labelOperational: "Fluxo",
        description: "Sequencia de processo entre etapas.",
      },
      "relates-to": {
        labelOperational: "Relaciona",
        description: "Associacao semantica generica.",
      },
    },
    contextualActions: {
      treeAddChild: "Adicionar filho",
      treeAddSibling: "Adicionar irmao",
      sitemapAddPage: "Adicionar pagina",
      sitemapAddSubpage: "Adicionar subpagina",
      mindmapAddBranch: "Adicionar ramificacao",
      mindmapAddReference: "Adicionar referencia",
      erdAddRelation: "Adicionar relacao",
      erdAddField: "Adicionar campo",
      graphAddComponent: "Adicionar componente",
      graphAddDependency: "Adicionar dependencia",
      graphAddSupportingService: "Adicionar servico auxiliar",
      timelineAddMilestone: "Adicionar marco",
      timelineAddDependency: "Adicionar dependencia temporal",
      defaultAddRelated: "Adicionar relacionado",
    },
    contextualActionEdgeLabels: {
      timelineNext: "Proximo",
      timelineDependency: "Dependencia",
    },
  },
  process: {
    fallbacks: {
      untitledItem: "Item sem titulo",
    },
    guidance: {
      decisionNeedsPaths:
        "Uma decisao fica mais didatica quando explicita pelo menos dois caminhos.",
      decisionNeedsShortLabels:
        "Use rotulos curtos para diferenciar cada caminho da decisao.",
      noteNeedsAnchor:
        "Conecte a observacao ao ponto que ela explica para evitar ruido solto no canvas.",
      endShouldTerminate:
        "Revise saidas extras. Encerramentos fortes normalmente terminam o percurso.",
      startHasIncoming:
        "Entradas no inicio costumam sinalizar um ponto anterior que ainda falta no mapa.",
    },
    lanes: {
      before: "Vem antes",
      after: "Segue depois",
      branch: "Bifurcacao",
      note: "Observacao",
    },
    summaryChips: {
      before: "Antes",
      after: "Depois",
      branch: "Desvios",
      note: "Observacoes",
    },
    nodeKinds: {
      "flow-step": {
        labelOperational: "Atividade",
        description: "Unidade de trabalho executavel dentro do processo.",
      },
      note: {
        labelOperational: "Observacao",
        description: "Contexto, risco ou excecao que apoia a leitura do fluxo.",
      },
    },
    quickActions: {
      "flow-add-next-step": {
        label: "Continuar fluxo",
      },
      "flow-add-branch": {
        label: "Criar bifurcacao",
        edgeLabel: "Condicao",
      },
      "flow-add-note": {
        label: "Registrar observacao",
        edgeLabel: "Observacao",
      },
    },
    inspector: {
      selectionBadgeLabel: "Trecho em foco",
      emptyTitle: "Leitura do fluxo",
      emptySummary:
        "Selecione um ponto do processo para ver papel, continuidade e contexto.",
      emptyGuidance:
        "Prefira abrir inicio, atividade, decisao ou fim para revisar o encadeamento operacional.",
      titleLabel: "Nome no fluxo",
      kindLabel: "Formato no fluxo",
      descriptionLabel: "Leitura operacional",
      descriptionPlaceholder:
        "Descreva o que acontece neste ponto, qual criterio decide a passagem e o que sai daqui.",
      tagsLabel: "Marcadores operacionais",
      tagsPlaceholder: "Ex.: SLA, excecao, aprovacao, canal, fila",
      tagsHelper:
        "Use marcadores curtos para risco, canal, turno, regra ou criticidade.",
      contextTitle: "Leitura operacional",
      generalSectionTitle: "Identificacao",
      detailsSectionTitle: "Contexto e notas",
      relationsSectionTitle: "Antes e depois",
      edgeGeneralSectionTitle: "Leitura da transicao",
      edgeLabelLabel: "Rotulo da passagem",
      edgeKindLabel: "Tipo de passagem",
      edgeSourceLabel: "Sai de",
      edgeTargetLabel: "Chega em",
      nodeSubtitle:
        "Entenda o papel deste ponto no fluxo antes de editar o texto.",
      edgeSubtitle:
        "Leia a transicao primeiro e ajuste o detalhe so quando necessario.",
      relationsEmptyState:
        "Ainda nao ha transicoes ou observacoes ligadas a este ponto.",
    },
    edgeOverview: {
      currentLabel: "Rotulo atual: {relationLabel}.",
    },
  },
  processInspector: {
    node: {
      openPrevious: "Abrir etapa anterior",
      openBranch: "Abrir desvio",
      openNote: "Abrir observacao",
      openNext: "Abrir proxima etapa",
      flowReadingTitle: "Leitura do fluxo",
      positionLabel: "Posicao",
      connectivityLabel: "Conectividade",
      generalHelper: "Ajuste o nome e o papel do trecho em foco.",
      outOfProfile: " (fora do perfil)",
      detailsHelper:
        "Use contexto operacional e marcadores apenas quando acrescentarem leitura.",
      relationsHelper:
        "{incomingCount} entrada(s), {outgoingCount} saida(s) e {previewCount} relacao(oes) em destaque.",
      openTransition: "Abrir transicao",
    },
    edge: {
      transitionReadingTitle: "Leitura da transicao",
      readingLabel: "Leitura",
      removeTransition: "Remover transicao",
    },
  },
  renderers: {
    tree: {
      rootBadge: "Raiz",
      hierarchyBadge: "Hierarquia",
      expand: "Expandir",
      collapse: "Colapsar",
    },
    erd: {
      comment: "Comentario",
      table: {
        field: "Campo",
        type: "Tipo",
        flags: "Flags",
      },
      emptyFields: "Nenhum campo definido.",
    },
    sitemap: {
      home: "Home",
      section: "Secao",
    },
    timeline: {
      milestone: "Marco",
    },
    mindmap: {
      root: "Tema central",
      reference: "Referencia",
      branch: "Ramificacao",
    },
  },
  selectionHud: {
    moreActions: "Mais acoes",
    center: "Centralizar",
    duplicate: "Duplicar",
    remove: "Remover",
  },
  versionDiff: {
    edgeKindCount: "{prefix}{count} relacao(oes) {label}",
    nodeRenamed:
      "{nodeKind} '{previousLabel}' renomeada para '{nextLabel}'.",
    nodeKindChanged:
      "{nodeLabel} mudou tipo: {previousKind} -> {nextKind}.",
    nodePayloadUpdated: "Payload de '{nodeLabel}' foi atualizado.",
    nodeAdded: "+ {nodeKind} '{nodeLabel}' adicionada.",
    nodeRemoved: "- {nodeKind} '{nodeLabel}' removida.",
    edgesAddedSuffix: "{edgeEntry} criadas.",
    edgesRemovedSuffix: "{edgeEntry} removidas.",
    edgesChanged: "{count} relacao(oes) tiveram atributos alterados.",
    viewportChanged: "Viewport do canvas foi alterado.",
    noChanges: "Nenhuma alteracao detectada.",
  },
  graph: {
    quickAddRoles: {
      "graph-core": {
        label: "Nucleo",
        description: "Componente central da rede.",
      },
      "graph-topic": {
        label: "Componente",
        description:
          "Peca arquitetural conectada ao nucleo ou a outros componentes.",
      },
      "graph-supporting": {
        label: "Servico auxiliar",
        description:
          "Apoio, adaptador, borda ou contexto transversal da estrutura.",
      },
    },
    nodeKinds: {
      workspace: {
        labelOperational: "Componente",
        description: "Elemento utilizado na leitura arquitetural da rede.",
      },
      project: {
        labelOperational: "Componente",
        description: "Elemento utilizado na leitura arquitetural da rede.",
      },
      entity: {
        labelOperational: "Componente",
        description:
          "Servico, modulo ou capacidade principal dentro da rede.",
      },
      page: {
        labelOperational: "Servico auxiliar",
        description:
          "Apoio transversal, adaptador, fronteira ou infraestrutura lateral.",
      },
      note: {
        labelOperational: "Contexto",
        description:
          "Anotacao auxiliar de apoio para contexto, restricao ou observacao de arquitetura.",
      },
      "flow-step": {
        labelOperational: "Servico",
        description: "Elemento operacional usado como capacidade ativa na rede.",
      },
    },
    roles: {
      "graph-core": {
        roleBadgeLabel: "Nucleo da rede",
        selectionBadgeLabel: "Nucleo em foco",
        footprintLabel: "Coordena a malha principal",
        summaryFallback:
          "Ponto central da arquitetura. Use para organizar dependencias, integracoes e fronteiras da rede.",
      },
      "graph-topic": {
        roleBadgeLabel: "Componente conectado",
        selectionBadgeLabel: "Componente em foco",
        footprintLabel: "Participa da rede ativa",
        summaryFallback:
          "Componente que participa das integracoes e dependencias da estrutura.",
      },
      "graph-supporting": {
        roleBadgeLabel: "Apoio arquitetural",
        selectionBadgeLabel: "Apoio em foco",
        footprintLabel: "Sustenta e contextualiza a rede",
        summaryFallback:
          "Capacidade transversal, servico auxiliar ou contexto de apoio para a rede.",
      },
    },
    structureTips: {
      connectivity:
        "Leitura da rede: {incomingCount} entrada(s) e {outgoingCount} saida(s).",
      core:
        "Use este item para orientar a rede principal e evitar dependencias difusas.",
      topic:
        "Revise integracoes laterais e dependencias diretas deste componente.",
      supporting:
        "Use este item para apoio, contexto, adaptacao ou fronteira do sistema.",
    },
    connectivityLabel:
      "Recebe {incomingCount} conexao(oes) e envia {outgoingCount}.",
  },
} as const;

export default ptBREditorCoreMessages;
