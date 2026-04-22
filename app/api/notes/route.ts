import { NextRequest } from "next/server";
import { createNote, getNotes } from "../../../lib/services/notes.service";

export async function GET(req: NextRequest) {
  return getNotes(req);
}

export async function POST(req: NextRequest) {
  return createNote(req);
}