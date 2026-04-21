import { LOCAL_COMMAND_STDOUT_TAG } from 'src/constants/xml.js'
import type { CommandResultDisplay } from 'src/types/command.js'
import type { Message as MessageType } from 'src/types/message.js'
import {
  createCommandInputMessage,
  createUserMessage,
  formatCommandInputTags,
} from 'src/utils/messages.js'
import { escapeXml } from 'src/utils/xml.js'

export function createImmediateLocalJsxFeedback(options: {
  commandName: string
  commandArgs: string
  result?: string
  display?: CommandResultDisplay
  metaMessages?: readonly string[]
  isFullscreen: boolean
}): {
  notificationText?: string
  transcriptMessages: MessageType[]
} {
  const transcriptMessages: MessageType[] = []

  if (options.result && options.display !== 'skip') {
    if (!options.isFullscreen) {
      transcriptMessages.push(
        createCommandInputMessage(
          formatCommandInputTags(options.commandName, options.commandArgs),
        ),
        createCommandInputMessage(
          `<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(options.result)}</${LOCAL_COMMAND_STDOUT_TAG}>`,
        ),
      )
    }
  }

  if (options.metaMessages?.length) {
    transcriptMessages.push(
      ...options.metaMessages.map(content =>
        createUserMessage({ content, isMeta: true }),
      ),
    )
  }

  return {
    notificationText:
      options.result && options.display !== 'skip'
        ? options.result
        : undefined,
    transcriptMessages,
  }
}
