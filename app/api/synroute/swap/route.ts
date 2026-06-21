import { proxySynRouteRequest } from '../_utils';

export async function POST(request: Request) {
  return proxySynRouteRequest('swap', request);
}
