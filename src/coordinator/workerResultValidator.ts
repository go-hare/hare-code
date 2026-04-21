/**
 * Keeps worker notifications small and explicit before they re-enter the
 * coordinator's context as <task-notification> messages.
 */

const MAX_RESULT_CHARS = 12_000
const TRUNCATION_NOTICE =
  '\n\n[Result truncated — exceeded coordinator context limit. Read the task output file for the full text.]'

export type WorkerStatus = 'completed' | 'failed' | 'killed'

export type ValidatedWorkerResult = {
  result: string
  wasTruncated: boolean
}

export function validateWorkerResult(
  finalMessage: string | undefined,
  status: WorkerStatus,
  description: string,
): ValidatedWorkerResult {
  if (!finalMessage || !finalMessage.trim()) {
    return {
      result: buildEmptyNotice(status, description),
      wasTruncated: false,
    }
  }

  const prefixed = addStatusPrefix(finalMessage, status, description)
  if (prefixed.length > MAX_RESULT_CHARS) {
    return {
      result:
        prefixed.slice(0, MAX_RESULT_CHARS - TRUNCATION_NOTICE.length) +
        TRUNCATION_NOTICE,
      wasTruncated: true,
    }
  }

  return { result: prefixed, wasTruncated: false }
}

function addStatusPrefix(
  text: string,
  status: WorkerStatus,
  description: string,
): string {
  if (status === 'failed') {
    return (
      `[WORKER FAILED — "${description}"]\n` +
      'The following is a partial or error result. Do NOT treat it as a confirmed finding.\n\n' +
      text
    )
  }

  if (status === 'killed') {
    return (
      `[WORKER STOPPED — "${description}"]\n` +
      'The following is an incomplete result because the worker was stopped before finishing.\n\n' +
      text
    )
  }

  return text
}

function buildEmptyNotice(status: WorkerStatus, description: string): string {
  if (status === 'failed') {
    return `[WORKER FAILED — "${description}" produced no output. The task did not complete successfully.]`
  }
  if (status === 'killed') {
    return `[WORKER STOPPED — "${description}" was stopped before producing any output.]`
  }
  return `[WORKER "${description}" completed but produced no output.]`
}
