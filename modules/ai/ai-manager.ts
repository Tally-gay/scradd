import fs from "fs";
import { getRelations } from "./prompts.js";

export class AIChat {
	private history: { role: string; content: string | any[]; type?: string }[];
	private stickyMessages: { role: string; content: string | any[]; type?: string }[] = [];
	private maxMessages: number;
	// Holds user messages that have not yet been paired with an assistant response.
	private pendingUserMessages: string[] = [];
	// Path to the file where training examples will be appended.
	private fineTuningFilePath: string | null = null;

	/**
	 * Constructs an AIChat instance.
	 *
	 * @param apiUrl - The API endpoint URL.
	 * @param sharedHistory - An external array to store shared messages.
	 * @param maxMessages - The maximum number of messages to retain in history.
	 * @param stickies - An array of sticky messages.
	 */
	constructor(
		_apiUrl: string,
		sharedHistory?: { role: string; content: string | any[]; type?: string }[],
		maxMessages: number = 100,
		stickies: { role: string; content: string | any[]; type?: string }[] = [],
	) {
		this.history = sharedHistory || [];
		this.maxMessages = maxMessages;
		this.stickyMessages = stickies || [];
		this.setFineTuningFilePath("fine-tuning.jsonl");
	}

	/**
	 * Set the file path where each conversation turn (user prompt + assistant reply) will be appended in JSONL format
	 * for fine tuning.
	 *
	 * @param filePath - The file path.
	 */
	setFineTuningFilePath(filePath: string): void {
		this.fineTuningFilePath = filePath;
	}

	/**
	 * Sends a message to the AI and returns the AI's response.
	 *
	 * @param message - The message content.
	 * @param role - The role of the message sender (default: "user").
	 * @param type - The type of message (default: "text").
	 * @returns The AI's reply as a string.
	 */
	async send(
		message: string | any[],
		role: string = "user",
		type: "text" | "image" | "complex" = "text",
		dontSave = false,
	): Promise<string> {
		// Record the user message.
		this.inform(message, role, type);

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${process.env.OPENAI_KEY}`,
			},
			body: JSON.stringify({
				model: "gpt-3.5-turbo",
				messages: this.getEffectiveHistory(),
			}),
		});
		const data = (await response.json()) as any;
		const reply = data.choices?.[0].message.content;
		if (!reply) {
			// Handle no-reply scenario if needed.
		}
		if (!dontSave) {
			// Record the assistant response.
			this.inform(reply, "assistant", "text");
		}

		return reply;
	}

	/**
	 * Adds a message to the shared history.
	 *
	 * Also, when a user message is added it is stored for fine tuning; when an assistant message is added, if there are
	 * pending user messages, a new training example is appended to the fine tuning file.
	 *
	 * @param content - The message content.
	 * @param role - The role of the message sender (default: "system").
	 * @param type - The type of message (default: "text").
	 */
	inform(
		content: string | any[],
		role: string = "system",
		type: "text" | "image" | "complex" = "text",
	): void {
		// If the message is from the user, accumulate it.
		if (role === "user") {
			this.pendingUserMessages.push(content.toString());
		}

		// Maintain the history size.
		if (this.history.length >= this.maxMessages) {
			this.history.shift(); // Remove the oldest message.
		}
		this.history.push({ role, content, type });

		// When an assistant message is recorded, create a training example using the accumulated user messages.
		if (
			role === "assistant" &&
			this.pendingUserMessages.length > 0 &&
			this.fineTuningFilePath
		) {
			const prompt = this.pendingUserMessages.join("\n") + "\nAssistant:";
			// Adding a leading space to the completion as often recommended.
			const completion = " " + content.toString().trim();
			const trainingExample = { prompt, completion };

			// Append the training example as a JSON object in JSONL format.
			fs.appendFileSync(
				this.fineTuningFilePath,
				JSON.stringify(trainingExample) + "\n",
				"utf8",
			);

			// Reset the pending user messages.
			this.pendingUserMessages = [];
		}
	}

	/**
	 * Retrieves the full chat history.
	 *
	 * @returns An array of messages.
	 */
	getChatHistory(): { role: string; content: string | any[]; type?: string }[] {
		return [...this.history];
	}

	getStickies() {
		return this.stickyMessages;
	}

	/**
	 * Combines sticky messages with shared history for API requests.
	 *
	 * @returns An array of messages.
	 */
	getEffectiveHistory(): { role: string; content: string | any[]; type?: string }[] {
		return [
			...this.stickyMessages,
			{ role: "system", content: getRelations() },
			...this.history,
		];
	}
}
