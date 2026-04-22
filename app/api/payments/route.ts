import { NextRequest } from "next/server";
import { createPayment, getPayments } from "../../../lib/services/payments.service";

export async function GET(req: NextRequest) {
  return getPayments(req);
}

export async function POST(req: NextRequest) {
  return createPayment(req);
}