export interface JiraTransitionCandidate {
  id: string
  name: string
  to?: {
    id?: string
    name?: string
  }
}

export interface JiraAssignableUserCandidate {
  accountId?: string
  emailAddress?: string
  displayName?: string
  active?: boolean
}

export interface JiraTransitionResolution {
  target: string
  transitionId: string | null
  transitionName: string | null
  warning: string | null
}

export interface JiraAssigneeResolution {
  email: string
  accountId: string | null
  displayName: string | null
  warning: string | null
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

export function resolveJiraTransition(
  transitions: JiraTransitionCandidate[],
  target: string
): JiraTransitionResolution {
  const normalizedTarget = normalize(target)
  const matches = transitions.filter((transition) => {
    const values = [
      transition.id,
      transition.name,
      transition.to?.id,
      transition.to?.name,
    ]
    return values.some((value) => normalize(value) === normalizedTarget)
  })

  if (matches.length === 1) {
    return {
      target,
      transitionId: matches[0].id,
      transitionName: matches[0].name,
      warning: null,
    }
  }

  if (matches.length > 1) {
    return {
      target,
      transitionId: null,
      transitionName: null,
      warning: `Jira-Transition fuer "${target}" ist mehrdeutig.`,
    }
  }

  return {
    target,
    transitionId: null,
    transitionName: null,
    warning: `Jira-Transition fuer "${target}" ist nicht verfuegbar.`,
  }
}

export function resolveJiraAssignee(
  users: JiraAssignableUserCandidate[],
  email: string
): JiraAssigneeResolution {
  const normalizedEmail = normalize(email)
  const activeUsers = users.filter((user) => user.active !== false && user.accountId)
  const exact = activeUsers.filter(
    (user) =>
      user.emailAddress === undefined ||
      normalize(user.emailAddress) === normalizedEmail
  )

  if (exact.length === 1 && exact[0].accountId) {
    return {
      email,
      accountId: exact[0].accountId,
      displayName: exact[0].displayName ?? null,
      warning: null,
    }
  }

  if (exact.length > 1) {
    return {
      email,
      accountId: null,
      displayName: null,
      warning: `Jira-Assignee fuer "${email}" ist mehrdeutig.`,
    }
  }

  return {
    email,
    accountId: null,
    displayName: null,
    warning: `Jira-Assignee fuer "${email}" ist nicht assignable oder nicht sichtbar.`,
  }
}
