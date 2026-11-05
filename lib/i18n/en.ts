/**
 * The English dictionary — the reference wording of the whole interface.
 *
 * Every string here was copied from the components and pages that already
 * render it, so moving a page onto the dictionary does not reword the product.
 * `Dictionary` is derived from this object, so adding a key here is what makes
 * it required in `zh.ts`: a locale that misses it fails type-checking.
 *
 * Placeholders use `{name}` and are filled by `fill()` from `./index`.
 */

export const en = {
  // ---------------------------------------------------------------- metadata
  meta: {
    description: "Evidence-traceable monitoring of AGI progress and recursive self-improvement.",
    titleTemplate: "%s · Human’s Last Dashboard",
    titles: {
      overview: "Human’s Last Dashboard",
      progress: "Progress",
      evidence: "Evidence Explorer",
      automation: "Automation",
      research: "Research & Attribution",
      record: "Record {id}",
      capability: "Capability",
    },
  },

  // ------------------------------------------------------------- navigation
  nav: {
    primary: "Primary",
    overview: "Overview",
    progress: "Progress",
    evidence: "Evidence Explorer",
    automation: "Automation",
    research: "Research & Attribution",
  },

  language: {
    english: "English",
    chinese: "中文",
    switchToEnglish: "Switch to English",
    switchToChinese: "Switch to Chinese",
  },

  // ---------------------------------------------------------------- shell
  common: {
    siteName: "Human’s Last Dashboard",
    tagline: "Evidence-traceable AGI progress monitor",
    skipToContent: "Skip to content",
    datasetLabel: "Curated from published sources (agent-maintained)",
    demoBannerTitle: "Demonstration data.",
    demoBanner:
      "Every record here is fictional and exists to exercise the interface. None of it is evidence about real AI systems.",
    curationBannerTitle: "Agent-curated records.",
    curationBanner:
      "Every record was fetched by a local agent pipeline and its quotes are checked against the captured bytes. No human has reviewed the evidence yet, so assessments are unreviewed drafts.",
    sidebarNote:
      "A claim is not a finding. Every assessment links to inspectable evidence and states what it does not establish.",
    footer:
      "L0–L7 is a working taxonomy for organizing evidence, not an established scale; no composite AGI score is computed.",
    unknownDate: "unknown",
  },

  // ---------------------------------------------------------------- legend
  legend: {
    title: "How to read statements",
    fact: "Observed fact: something a source reports as having happened.",
    interp: "Interpretation: an author’s reading of the facts.",
    spec: "Speculation or hypothesis: not established.",
    forecast: "Forecast: a dated, checkable prediction.",
    model:
      "Hatched background: written by a model. Treat it as a proposal until a reviewer accepts it.",
    evidence: {
      accepted: "Accepted",
      notAccepted: "Not yet accepted",
      supports: "Supports",
      contradicts: "Contradicts",
      qualifies: "Qualifies",
      context: "Context",
    },
  },

  // ------------------------------------------------------------ vocabulary
  labels: {
    provenance: {
      demo: "Demo (fictional)",
      curated: "Curated",
    },
    claimType: {
      "observed-fact": "Observed fact",
      "author-interpretation": "Author interpretation",
      forecast: "Forecast",
      speculation: "Speculation",
    },
    assessmentStatus: {
      unverified: "Unverified",
      partial: "Partial",
      "demonstrated-under-conditions": "Demonstrated under conditions",
      "independently-reproduced": "Independently reproduced",
      contradicted: "Contradicted",
      "insufficient-evidence": "Insufficient evidence",
    },
    polarity: {
      supports: "Supports",
      contradicts: "Contradicts",
      qualifies: "Qualifies",
      contextualizes: "Contextualizes",
    },
    reviewStatus: {
      unreviewed: "Unreviewed",
      accepted: "Accepted",
      rejected: "Rejected",
      "needs-follow-up": "Needs follow-up",
    },
    sourceTier: {
      primary: "Primary",
      independent: "Independent",
      lead: "Lead",
    },
    sourceType: {
      paper: "Paper",
      "technical-report": "Technical report",
      benchmark: "Benchmark",
      repository: "Repository",
      experiment: "Experiment",
      announcement: "Announcement",
      discussion: "Discussion",
      other: "Other",
    },
    evidenceType: {
      "direct-result": "Direct result",
      reproduction: "Reproduction",
      "independent-evaluation": "Independent evaluation",
      "benchmark-result": "Benchmark result",
      "code-inspection": "Code inspection",
      "expert-analysis": "Expert analysis",
      other: "Other",
    },
    forecastStatus: {
      open: "Open",
      "resolved-true": "Resolved true",
      "resolved-false": "Resolved false",
      ambiguous: "Ambiguous",
      expired: "Expired",
    },
    candidateStatus: {
      new: "New",
      "triaged-review": "Accepted for review",
      duplicate: "Duplicate",
      rejected: "Rejected",
      archived: "Archived",
    },
    attributionStatus: {
      open: "open",
      weakened: "weakened",
      retained: "retained",
    },
    extractionStatus: {
      candidate: "candidate",
      reviewed: "reviewed",
      "source-supported": "source supported",
      unsupported: "unsupported",
    },
    sourceStatus: {
      candidate: "candidate",
      reviewed: "reviewed",
      unavailable: "unavailable",
      rejected: "rejected",
    },
    confidence: {
      low: "low",
      moderate: "moderate",
      high: "high",
    },
  },

  // ----------------------------------------------------------------- chips
  chips: {
    demo: "Demo",
    demoTitle: "Fictional demonstration record. Not evidence about any real system.",
    modelGenerated: "Model-generated",
    modelGeneratedTitle: "Model-generated",
    modelGeneratedByTitle: "Generated by {model}. Not reviewed unless stated.",
    developerAffiliated: "Developer-affiliated",
    developerAffiliatedTitle:
      "The reporting party built or operates the system being reported on.",
  },

  statement: {
    fact: "Observed fact",
    interp: "Interpretation",
    spec: "Speculation or hypothesis",
    forecast: "Forecast",
    modelSuffix: ", model-generated",
  },

  // ---------------------------------------------------------------- gate
  gate: {
    verdictBlocked: "Blocked. This change cannot be accepted yet.",
    verdictReady: "Ready for human review. Nothing has been accepted.",
    state: {
      met: "Met",
      unmet: "Not met",
      "not-required": "Not required",
      "awaiting-human": "Awaiting a human reviewer",
    },
    check: {
      criterion: "Exact criterion identified",
      "direct-evidence": "Direct supporting evidence",
      "direct-evidence-contradiction": "Direct evidence of the contradiction",
      "conditions-baseline": "Evaluation conditions and baseline",
      "human-intervention": "Human intervention and hidden scaffolding",
      replication: "Independent replication",
      counterevidence: "Counterevidence and alternatives searched",
      generalization: "Generalization limits, failures, cost, regressions",
      "reviewer-decision": "Reviewer decision and rationale",
    },
    detail: {
      noCriterion: "No criterion has been recorded for this proposal.",
      noDirectContradiction: "No accepted primary or independent counterevidence is linked.",
      noDirectEvidence: "No supporting evidence is linked.",
      acceptedDirect: "{count} accepted record(s) from primary or independent sources.",
      linkedButNotAccepted:
        "{count} supporting record(s) linked, but none is both accepted and from a primary or independent source ({list}).",
      directNotRequired: "A move to “{status}” does not assert a capability.",
      noConditionsBaseline: "Conditions and baseline are not recorded.",
      noHumanIntervention:
        "The role of human intervention and scaffolding has not been assessed.",
      acceptedIndependent:
        "{count} accepted record(s) from a source that is independent of the developer.",
      noIndependentSupport:
        "No accepted support comes from a party independent of the developer. Developer-reported results do not count as replication.",
      replicationNotRequired: "Required only for “independently-reproduced”.",
      counterLinked: "{count} counterevidence record(s) linked.",
      noCounterSearch: "No counterevidence search is recorded.",
      noGeneralization: "Limits and failures are not recorded.",
      reviewerOnlyHuman:
        "Only a human reviewer can accept or reject. A model cannot approve its own proposal.",
    },
    blocker: {
      leadsOnly: "Support comes from leads only; leads cannot move a stage.",
      notAcceptedPrimary: "No supporting record is both accepted and primary or independent.",
      developerOnly:
        "Support is developer-affiliated only; it cannot establish independent reproduction.",
      unmetCheck: "{check}: not met.",
    },
  },

  // ------------------------------------------------------ evidence explorer
  explorer: {
    intro:
      "Browse sources, the claims extracted from them, and the evidence that bears on each capability. A claim records what a source asserts; it is not a finding until evidence has been reviewed.",
    tablistLabel: "Record type",
    tabEvidence: "Evidence",
    tabClaims: "Claims",
    tabSources: "Sources",
    search: "Search",
    searchPlaceholder: "Observation, method, source, id",
    sourceTier: "Source tier",
    polarity: "Polarity",
    reviewStatus: "Review status",
    claimType: "Claim type",
    all: "All",
    shown: "{count} of {total} shown",
    linkCopied: "Link copied",
    copyFailed: "Copy failed — copy the address bar instead",
    copyLink: "Copy link",
    copyLinkTitle: "Copy a link that restores these filters",
    clearFilters: "Clear filters",
    sharedLinkNote:
      "A shared link carries its filters in the URL; they are applied once the page has loaded.",
    emptyLead: "Nothing matches these filters.",
    emptyTail: "to see every record.",
    method: "Method.",
    limitations: "Limitations.",
    sourceMeta: "{publisher} · published {date} · status {status}",
  },

  // --------------------------------------------------------- record detail
  record: {
    backToExplorer: "← Evidence Explorer",
    evidenceTitle: "Evidence {id}",
    claimTitle: "Claim {id}",
    method: "Method",
    limitations: "Limitations",
    reproducibility: "Reproducibility",
    sourceSpan: "Source span",
    conditions: "Conditions",
    publisher: "Publisher",
    published: "Published",
    sourceSection: "Source",
    claimsBearsOn: "Claims this bears on",
    usedBy: "Used by",
    evidenceBearingOn: "Evidence bearing on this claim",
    claims: "Claims",
    evidence: "Evidence",
    forecastLink: "Forecast {id}",
    assessmentLink: "{level} {name}, assessment v{version}",
    notCited: "Not cited by any assessment or forecast yet.",
    claimNote:
      "A claim records what a source asserts and how it is supported. It does not establish that the statement is true.",
    noLinkedEvidence: "No evidence is linked. Until some is, this claim stays a lead.",
    leadSourceNote:
      "This source is a lead. It can start an investigation but cannot support a stage upgrade on its own.",
    developerSourceNote:
      "The publisher built or operates the system described. Its results are primary evidence of what the developer reports, not independent validation.",
    noClaims: "No claims extracted.",
    noEvidence: "No evidence records.",
  },

  // ------------------------------------------------------ provenance panel
  provenance: {
    sectionTitle: "Provenance",
    demoNote:
      "Fictional demonstration record: the source, publisher, authors, and the recorded dates were invented to exercise the interface. No URL, content hash, or snapshot was ever observed for it.",
    recordId: "Record id",
    provenanceRow: "Provenance",
    created: "Created",
    generatedBy: "Generated by",
    publisher: "Publisher",
    authors: "Authors",
    published: "Published",
    canonicalUrl: "Canonical URL",
    retrievedAt: "Retrieved at",
    contentHash: "Content hash",
    snapshot: "Snapshot",
    status: "Status",
    sourceType: "Source type",
    sourceTier: "Source tier",
    developerAffiliated: "Developer-affiliated",
    generatedByValue: "{model} · workflow {workflow}",
    noAttribution: "Not recorded — no model or workflow attribution on this record.",
    noneRecorded: "None recorded",
    notRecorded: "Not recorded",
    noUrl: "Not observed — no URL is stored for this source.",
    noRetrievedAt: "Not observed — this system captured no retrieval time.",
    noHash: "Not recorded — no hash of captured content.",
    noSnapshot: "Not recorded — this dataset stores no snapshot reference for any source.",
    affiliatedYes: "Yes — the reporting party built or operates the system described.",
    affiliatedNo: "No",
    doesNotEstablishTitle: "What this record does not establish.",
    doesNotEstablishEvidence:
      "It reports one observation and the method that produced it. It does not establish that the observation reproduces, that it holds outside the conditions recorded above, that the method was executed as described, or that any claim it is linked to is true. Review status is the only review this system records: an unreviewed record has had none, and acceptance is a reviewer’s judgement rather than a measurement.",
    doesNotEstablishClaim:
      "It records what a source asserts and where in the source the assertion appears. It does not establish that the statement is true, that the source is authoritative, or that the extraction is faithful to the source. A claim with no linked evidence is still a lead.",
    doesNotEstablishSource:
      "It is a pointer to an artefact plus what this system captured about it. It does not establish that the artefact exists, that its content matches this record, or that its publisher is correct. A primary tier says who produced it, not that it is independent or validated: a developer-affiliated source reports what the developer reports.",
  },

  // ------------------------------------------------------------- progress
  progress: {
    title: "Capability by capability",
    intro:
      "Each row is assessed on its own criteria. There is no overall progress figure: levels can advance unevenly, and a result at one level does not imply the next.",
    confidence: "{level} confidence",
    notAssessed: "Not assessed",
    changeProposed: "Change proposed",
    changeProposedBlocked: "Change proposed · blocked",
    evidenceRecordsOne: "{count} evidence record",
    evidenceRecordsOther: "{count} evidence records",
    noEvidenceLinked: "No evidence linked",
    columnCapability: "Capability",
    columnAssessment: "Assessment",
    columnEvidence: "Linked evidence",
    keyTitle: "How to read the squares",
  },

  // ------------------------------------------------------------ capability
  capability: {
    backToAll: "← All capabilities",
    passCriteria: "Pass criteria",
    nonCriteria: "Does not count as evidence",
    knownBottlenecks: "Known bottlenecks",
    currentAssessment: "Current assessment",
    assessmentAside: "Version {version} · reviewed {date}",
    conditions: "Conditions",
    limitations: "Limitations",
    supportingEvidence: "Supporting evidence",
    counterevidence: "Counterevidence and qualifications",
    noneCited: "None cited",
    notAssessed:
      "This capability has not been assessed. It is not scored as zero, because no evidence has been reviewed either way. An assessment requires a criterion, linked evidence, and a reviewer.",
    proposedChange: "Proposed change",
    linkedEvidence: "Linked evidence",
    linkedEvidenceOne: "{count} record",
    linkedEvidenceOther: "{count} records",
    noEvidence: "No evidence is linked to this capability.",
    groupSupports: "Supports",
    groupAgainst: "Contradicts or qualifies",
    groupContext: "Context only",
    notCitedByCurrent: "Not cited by the current assessment.",
    history: "Assessment history",
    historyAside: "prior versions are kept",
    versionNumber: "v{version}",
    historyMeta: "{date} · {reviewer}",
    fromVersion: " · from v{version}",
    firstVersion: " · first version",
    cited: "Cited: {ids}",
    noEvidenceCited: "no evidence",
  },

  // ------------------------------------------------------------- overview
  overview: {
    title: "What changed, and what it rests on",
    intro:
      "Each capability is assessed against written criteria and linked to the records behind it. Counts describe the curated records, which are agent-assembled drafts until a reviewer accepts them.",
    figureEvidenceRecords: "evidence records",
    figureNotYetAccepted: "{count} not yet accepted",
    figureClaimsAwaitingSupport: "claims awaiting support",
    figureCandidateOrUnsupported: "candidate or unsupported",
    figureAssessmentRevisions: "assessment revisions",
    figurePriorVersionsKept: "prior versions kept",
    figureForecasts: "forecasts",
    figureOpenForecasts: "{count} open",
    figureResolvedForecasts: "{count} resolved",
    boardTitle: "Where each capability stands",
    boardAside: "one tile per level; levels are not a ladder",
    boardAllLink: "Capability by capability →",
    boardNoEvidence: "No evidence linked",
    mixTitle: "What the evidence says",
    mixAside: "{count} records, one square each",
    mixReviewState: "Review state",
    mixNoneAccepted:
      "No record has been accepted by a reviewer yet, so none of these counts is a finding.",
    mixEmpty: "No evidence records.",
    sourcesTitle: "Who the evidence comes from",
    sourcesAside: "{count} sources, one dot each",
    sourcesSummary:
      "{independent} of {total} sources are independent-tier; {developer} are developer-affiliated.",
    sourcesKeyIndependentOfDeveloper: "Not developer-affiliated",
    sourcesKeyDeveloper: "Developer-affiliated",
    sourcesLink: "Browse sources →",
    waitingOnReview: "Waiting on review",
    proposedChangeCount: "{count} proposed change",
    noProposals:
      "No proposed stage changes. Proposals appear here when a model or reviewer suggests a new status and are held until the gate is satisfied.",
    blocked: "Blocked: {reason}",
    gateNotSatisfied: "gate not satisfied",
    readyForReview: "Ready for human review.",
    bottlenecks: "Bottlenecks in view",
    bottlenecksAside: "from capability criteria",
    bottlenecksSummary: "{count} known bottlenecks across {levels} levels",
    recentChanges: "Recent changes",
    recentAside: "newest first",
    kindEvent: "Event",
    kindAssessment: "Assessment",
    kindForecast: "Forecast",
    footerLead:
      "{count} capabilities are defined; capabilities without an assessment are shown as not assessed on the",
    footerLink: "Progress",
    footerTail: "page rather than given a default score.",
  },

  // ------------------------------------------------------------- research
  research: {
    title: "Research & Attribution",
    intro:
      "For each observed change, the explanations that could account for it, what would tell them apart, and what remains unresolved. A hypothesis stays a hypothesis until the evidence can separate it from its alternatives.",
    competingExplanations: "Competing explanations",
    groupedByEvent: "grouped by observed event",
    eventMeta: "{date} · event {id}",
    noAttribution:
      "No attribution has been proposed for this event. Absence of a hypothesis is not a finding that no cause exists.",
    attributionMeta: "{status} · {level} confidence",
    proposedMechanism: "Proposed mechanism.",
    alternatives: "Alternative explanations",
    discriminatingTests: "What would tell them apart",
    assumptions: "Assumptions",
    supportingEvidence: "Supporting evidence",
    counterevidence: "Counterevidence",
    noneRecorded: "None recorded",
    forecasts: "Forecasts",
    forecastsAside: "original wording is never edited",
    resolvedForecastOne: "{count} resolved forecast.",
    resolvedForecastOther: "{count} resolved forecasts.",
    calibration:
      "That is too few to evaluate calibration, so no score is shown. A calibration measure would appear here once enough forecasts have resolved.",
    noProbability: "No probability recorded",
    recordedProbability: "Recorded probability {percent}%",
    resolvesBy: "Resolves by",
    created: "Created",
    resolutionCriteria: "Resolution criteria, fixed in advance",
    rationale: "Rationale",
    resolution: "Resolution, {date}",
    evidence: "Evidence",
    unresolvedQuestions: "Unresolved questions",
  },

  // ----------------------------------------------------------- automation
  automation: {
    title: "Automation intake",
    intro:
      "A local agent maintains two continuous jobs against this repository: discovery, which scans arXiv, GitHub and a handful of research feeds for candidate sources, and a dataset audit, which checks the dashboard records. This page shows what they last produced. It is the only place in the dashboard where unreviewed material appears, and it appears as leads.",
    leadsAreNotEvidence: "Discovered leads are not evidence.",
    figureLeadsStored: "leads stored",
    figureShownBelow: "{count} shown below",
    figureAwaitingTriage: "awaiting triage",
    figureNoneTriaged: "none triaged yet",
    figureTriaged: "{count} triaged",
    figureWithoutPage: "without a fetched page",
    figureWithHash: "{count} have a content hash",
    figureAuditFindings: "audit findings",
    figureAuditCounts: "{error} error · {warn} warn · {info} info",
    figureNoAudit: "no audit yet",
    snapshotNote:
      "Snapshot generated {date} by {by}. The tool runs every six hours (discovery) and daily (audit) on the machine that holds the store; {runs} runs are on record, {discovery} of them discovery and {quality} audit. The numbers on this page stop moving until that snapshot is published and committed.",
    showMoreLeads: "Show {count} more leads",
    leadsTitle: "Leads, newest first",
    leadsAside: "{shown} of {total} · {withBytes} with fetched bytes",
    leadsCaption: "Discovered candidate sources with the retrieval facts observed for each.",
    columnSource: "Source",
    columnPublished: "Published",
    columnFoundVia: "Found via",
    columnRetrieved: "Retrieved",
    columnStatus: "Status",
    columnAdapter: "Adapter",
    columnLeads: "Leads",
    columnShare: "Share",
    columnQuery: "Query",
    columnDate: "Date",
    columnRelative: "Relative",
    columnRule: "Rule",
    columnResult: "Result",
    columnFindings: "Findings",
    columnInspected: "Inspected",
    leadNotRecorded: "not recorded",
    leadNoResponse: "no response",
    leadHttpStatus: "HTTP {status}",
    leadHash: "sha256 {hash}…",
    leadNoHash: "no hash",
    leadFound: "found {date}",
    tableNote:
      "Every row links to the page the tool fetched. A row with a non-200 status stores the error that was observed and no summary was taken from the error page, so the title is what the feed or API reported, not what the page says.",
    sourcesTitle: "Where leads come from",
    sourcesAside: "{count} stored",
    adapterCaption: "Leads per adapter and per configured query.",
    queryCaption: "Leads per configured discovery query.",
    reasonsTitle: "Why a lead has no usable page",
    reasonsAside: "{errors} of {total}",
    intakeTitle: "Intake per day",
    intakeAside: "UTC dates, from the stored records",
    dayCaption: "Leads stored per calendar day.",
    runsTitle: "Recent runs",
    runsAside: "{shown} of {total}",
    auditTitle: "Last dataset audit",
    auditAside: "{count} finding(s) · {subjects} subject(s) inspected",
    auditMeta:
      "Run {id}, {time}. A rule that inspected zero subjects is reported as skipped; a skipped check is not a pass.",
    auditCaption: "Audit rules with findings and subjects inspected.",
    statePass: "pass",
    stateFail: "fail",
    stateSkipped: "skipped",
    skippedList:
      "Skipped ({count}): {rules} — nothing of that kind exists in the dataset to check.",
    noAuditBody: "No audit run has been stored yet. Run {command} to produce one.",
    limitsTitle: "What this page does not establish",
    docsNote:
      "The tool itself is documented in {link}. Its store lives outside the repository and is never deployed.",
  },
};

/** The shape every locale must provide. English is the reference. */
export type Dictionary = typeof en;
