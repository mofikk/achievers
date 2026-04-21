import { NextResponse } from "next/server";

type ApiSuccess<T> = {
  data: T;
  error: null;
};

type ApiFailure = {
  data: null;
  error: string;
};

export function success<T>(data: T, status = 200) {
  const payload: ApiSuccess<T> = {
    data,
    error: null
  };

  return NextResponse.json(payload, { status });
}

export function failure(message: string, status = 400) {
  const payload: ApiFailure = {
    data: null,
    error: message
  };

  return NextResponse.json(payload, { status });
}
