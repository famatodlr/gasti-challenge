import { AssistantMarkdown, type AssistantAnswerUi, inferSuggestedQuestion } from './assistant-markdown';
import type { ActivityFeedItem, ActivityFeedStatus } from './activity';

function activityLabelClass(status: ActivityFeedStatus): string {
  if (status === 'error') {
    return 'text-[var(--state-error)]';
  }

  if (status === 'warning') {
    return 'text-[var(--state-warning)]';
  }

  if (status === 'active') {
    return 'text-[var(--state-active)]';
  }

  return 'text-[var(--text-muted)]';
}

function activityDotClass(status: ActivityFeedStatus): string {
  if (status === 'error') {
    return 'border-[color:color-mix(in_srgb,var(--state-error),transparent_42%)] bg-[color:color-mix(in_srgb,var(--state-error),transparent_20%)]';
  }

  if (status === 'warning') {
    return 'border-[color:color-mix(in_srgb,var(--state-warning),transparent_42%)] bg-[color:color-mix(in_srgb,var(--state-warning),transparent_20%)]';
  }

  if (status === 'active') {
    return 'border-[color:color-mix(in_srgb,var(--state-active),transparent_40%)] bg-[color:color-mix(in_srgb,var(--state-active),transparent_20%)]';
  }

  return 'border-[var(--border-subtle)] bg-[var(--surface-3)]';
}

export function formatActivityTime(timestamp: string | undefined): string {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AssistantMessageCard({
  content,
  answerUi,
  onSuggestedQuestionClick,
}: {
  content: string;
  answerUi?: AssistantAnswerUi | null;
  onSuggestedQuestionClick?: (question: string) => void;
}) {
  const suggestedQuestion = answerUi?.suggestedQuestion ?? inferSuggestedQuestion(content);
  const hasStructuredBlocks = Boolean(answerUi?.headline || answerUi?.summary || answerUi?.bullets?.length || answerUi?.note);
  const fallbackBody = !hasStructuredBlocks || (!answerUi?.summary && !answerUi?.bullets?.length) ? content : null;

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3.5 shadow-[var(--shadow-md)]">
      {answerUi?.headline ? <h3 className="text-sm font-semibold text-[var(--text-primary)]">{answerUi.headline}</h3> : null}
      {answerUi?.summary ? <p className="text-sm leading-7 text-[var(--text-secondary)]">{answerUi.summary}</p> : null}
      {answerUi?.bullets?.length ? (
        <ul className="space-y-2">
          {answerUi.bullets.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-dim)]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {answerUi?.note ? (
        <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]">
          {answerUi.note}
        </p>
      ) : null}
      {fallbackBody ? <AssistantMarkdown content={fallbackBody} /> : null}
      {suggestedQuestion && onSuggestedQuestionClick ? (
        <button
          type="button"
          onClick={() => onSuggestedQuestionClick(suggestedQuestion)}
          className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-soft)] hover:text-[var(--text-primary)]"
        >
          {suggestedQuestion}
        </button>
      ) : null}
    </div>
  );
}

export function ActivityRail({ items, isLoading }: { items: ActivityFeedItem[]; isLoading: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 backdrop-blur-[1px]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        <p className="text-sm font-medium text-[var(--text-secondary)]">Actividad</p>
        <p className="mt-0.5 text-xs text-[var(--text-dim)]">{isLoading ? 'En curso' : items.length ? 'Última respuesta' : 'En espera'}</p>
      </div>
      <div className="max-h-[400px] overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <p className="py-8 text-center text-xs leading-6 text-[var(--text-dim)]">
            La actividad aparecerá cuando Gasti procese tu próxima consulta.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((item) => {
              const time = formatActivityTime(item.timestamp);
              const isToolMetadataRow = (item.type === 'tool_call' || item.type === 'tool_result') && !item.detail;
              return (
                <li key={item.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full border ${activityDotClass(item.status)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`${isToolMetadataRow ? 'text-[11px] leading-4 text-[var(--text-dim)]/80' : `text-xs leading-5 ${activityLabelClass(item.status)}`}`}
                        >
                          {item.label}
                        </p>
                        {time ? <span className="shrink-0 whitespace-nowrap text-[9px] tabular-nums text-[var(--text-dim)]/80">{time}</span> : null}
                      </div>
                      {item.detail ? (
                        <p className="mt-0.5 font-mono text-[9px] leading-4 text-[var(--text-dim)]/75">{item.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
