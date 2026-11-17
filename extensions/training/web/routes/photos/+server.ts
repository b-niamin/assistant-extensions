/** GET /training/photos?q=leg+curl: photos of the Free Exercise DB that an own exercise can take. */
import { json, type ExtHandler } from '$shell';
import { searchPhotos } from '../../lib/photos';

export const GET: ExtHandler = async ({ url }) => json(searchPhotos(String(url.searchParams.get('q') ?? '').slice(0, 80), 40));
