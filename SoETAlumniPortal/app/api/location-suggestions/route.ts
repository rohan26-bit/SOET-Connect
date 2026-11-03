import { NextRequest, NextResponse } from 'next/server';

type LocationKind = 'city' | 'state' | 'country';

interface PhotonProperties {
  name?: string;
  type?: string;
  osm_value?: string;
  city?: string;
  locality?: string;
  suburb?: string;
  district?: string;
  state?: string;
  country?: string;
  countrycode?: string;
}

interface PhotonFeature {
  properties?: PhotonProperties;
}

const SETTLEMENT_TYPES = new Set([
  'city',
  'town',
  'village',
  'municipality',
  'hamlet',
  'suburb',
  'locality',
  'borough',
  'quarter',
  'neighbourhood',
]);

function getSuggestion(
  properties: PhotonProperties,
  kind: LocationKind,
  query: string,
): { value: string; label: string } | null {
  const featureType = (properties.type || properties.osm_value || '').toLowerCase();
  let value = '';

  if (kind === 'city') {
    if (SETTLEMENT_TYPES.has(featureType)) {
      value = properties.name || '';
    } else {
      value =
        properties.city ||
        properties.locality ||
        properties.suburb ||
        properties.district ||
        '';
    }
  } else if (kind === 'state') {
    value = properties.state || '';
    if (!value && ['state', 'province', 'region'].includes(featureType)) {
      value = properties.name || '';
    }
  } else {
    value = properties.country || '';
    if (!value && featureType === 'country') {
      value = properties.name || '';
    }
  }

  value = value.trim();
  if (!value || !value.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
    return null;
  }

  const context =
    kind === 'city'
      ? [properties.state, properties.country].filter(Boolean)
      : kind === 'state'
        ? [properties.country].filter(Boolean)
        : [properties.countrycode?.toUpperCase()].filter(Boolean);

  const label = [value, ...context].filter(Boolean).join(', ');
  return { value, label };
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') || '').trim();
  const kind = request.nextUrl.searchParams.get('type') as LocationKind | null;

  if (!['city', 'state', 'country'].includes(kind || '')) {
    return NextResponse.json({ error: 'Invalid location type.' }, { status: 400 });
  }

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  if (query.length > 80) {
    return NextResponse.json({ error: 'Search text is too long.' }, { status: 400 });
  }

  try {
    const photonUrl = new URL('https://photon.komoot.io/api/');
    photonUrl.searchParams.set('q', query);
    photonUrl.searchParams.set('limit', '20');
    photonUrl.searchParams.set('lang', 'en');
    // Photon supports dedicated city/state/country search layers.
    photonUrl.searchParams.set('layer', kind!);

    const response = await fetch(photonUrl.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Location suggestions are temporarily unavailable.', suggestions: [] },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { features?: PhotonFeature[] };
    const suggestions = new Map<string, { value: string; label: string }>();

    for (const feature of data.features || []) {
      const properties = feature.properties || {};
      const suggestion = getSuggestion(properties, kind!, query);

      if (suggestion && !suggestions.has(suggestion.value.toLocaleLowerCase())) {
        suggestions.set(suggestion.value.toLocaleLowerCase(), suggestion);
      }

      if (suggestions.size >= 8) break;
    }

    return NextResponse.json({
      suggestions: Array.from(suggestions.values()),
    });
  } catch {
    return NextResponse.json(
      { error: 'Location suggestions are temporarily unavailable.', suggestions: [] },
      { status: 502 },
    );
  }
}
