export type MainLaunchMode =
	| "headless"
	| "continue"
	| "direct-connect"
	| "ssh-remote"
	| "assistant-chat"
	| "resume-like"
	| "interactive";

export function determineMainLaunchMode(options: {
	isNonInteractiveSession: boolean;
	continueRequested: boolean;
	hasPendingDirectConnect: boolean;
	hasPendingSsh: boolean;
	hasPendingAssistantChat: boolean;
	hasResumeLikeRequest: boolean;
}): MainLaunchMode {
	const {
		isNonInteractiveSession,
		continueRequested,
		hasPendingDirectConnect,
		hasPendingSsh,
		hasPendingAssistantChat,
		hasResumeLikeRequest,
	} = options;

	if (isNonInteractiveSession) {
		return "headless";
	}
	if (continueRequested) {
		return "continue";
	}
	if (hasPendingDirectConnect) {
		return "direct-connect";
	}
	if (hasPendingSsh) {
		return "ssh-remote";
	}
	if (hasPendingAssistantChat) {
		return "assistant-chat";
	}
	if (hasResumeLikeRequest) {
		return "resume-like";
	}
	return "interactive";
}
