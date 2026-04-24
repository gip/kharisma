import jwt from "jsonwebtoken";

export type SessionTokenPayload = {
  sub: string;
  sid: string;
  address: string;
};

export function createSessionToken(input: {
  secret: string;
  userId: number;
  sessionId: string;
  address: string;
  expiresAt: Date;
}) {
  return jwt.sign(
    {
      sid: input.sessionId,
      address: input.address,
    },
    input.secret,
    {
      subject: String(input.userId),
      expiresIn: Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)),
    },
  );
}

export function verifySessionToken(secret: string, token: string) {
  return jwt.verify(token, secret) as SessionTokenPayload;
}
