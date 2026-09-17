import { serverRequest } from './platformService';

export async function getRecommendations(cart) {
  if (!cart?.length) return [];
  const result = await serverRequest('recommendations',{cartIds:[...new Set(cart.map(item=>item.id))]});
  return result.suggestions || [];
}
