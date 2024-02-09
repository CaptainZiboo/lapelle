import { PortailCredentials } from "../../services/portail";
import jwt from "jsonwebtoken";

export const sign = (credentials: PortailCredentials): string => {
  return jwt.sign(credentials, process.env.CREDENTIALS_SECRET!);
};

export const verify = (
  token?: string | null
): PortailCredentials | undefined => {
  if (!token) return;

  const test = jwt.verify(token, process.env.CREDENTIALS_SECRET!);

  return test as PortailCredentials;
};
