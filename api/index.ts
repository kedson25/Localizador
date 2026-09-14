import { dispatchApiRoute } from './_lib/router';

export default async function handler(req: any, res: any) {
  return dispatchApiRoute(req, res);
}
