import mongoose, { Schema, type Document } from "mongoose";

export interface IChatConversation extends Document {
  userId: mongoose.Types.ObjectId;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatConversationSchema = new Schema<IChatConversation>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ChatConversation = mongoose.model<IChatConversation>(
  "ChatConversation",
  ChatConversationSchema
);
