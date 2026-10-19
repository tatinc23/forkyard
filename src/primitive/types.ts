export interface OutboundMail {
	to: string;
	subject: string;
	text: string;
	/** Thread key so replies stay on one contract conversation. */
	threadId?: string;
	idempotencyKey: string;
}

export interface InboundMail {
	messageId: string;
	threadId?: string;
	from: string;
	to: string;
	subject: string;
	text: string;
}

export interface SendResult {
	ok: boolean;
	id: string;
	mode: "mock" | "live";
	error?: string;
}

export interface PrimitiveGateway {
	send(mail: OutboundMail): Promise<SendResult>;
}
