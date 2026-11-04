import { describe, expect, it } from "vitest";
import {
  COLLECTORS,
  facebook,
  googleReviews,
  instagram,
  instagramKeyword,
  judgeListing,
  plainText,
  reddit,
  tiktok,
  web,
  webCandidate,
} from "../../scripts/lib/story-finder/collectors";
import {
  chargeCap,
  newListingTally,
  summariseListings,
  type FinderPlace,
  type PlannedQuery,
} from "../../scripts/lib/story-finder/types";
import { MENTION_PLATFORMS } from "@/lib/story-finder/mention";

// Fictional places and posts only: none of these exist.
const place: FinderPlace = {
  placeId: "mockplace1",
  slug: "fictional-test-coffee",
  category: "cafe",
  names: [
    { lang: "ja", script: "kanji", value: "架空珈琲 試験堂", isPrimary: true },
    { lang: "en", script: "latin", value: "Fictional Test Coffee House", isPrimary: true },
  ],
  pin: { lat: 32.75, lng: 129.87 },
};
const other: FinderPlace = {
  placeId: "mockplace2",
  slug: "fictional-test-bath",
  category: "bath",
  names: [{ lang: "ja", script: "kanji", value: "試験湯", isPrimary: true }],
  pin: null,
};
const options = { perPlace: 5, batchSize: 20 };
const TEXT = "架空珈琲 試験堂（テスト用の架空の店）は、店主の祖父が始めた焙煎所だそうです。";

describe("plans", () => {
  it("every platform has a collector with a documented actor", () => {
    for (const platform of MENTION_PLATFORMS) {
      const collector = COLLECTORS[platform];
      expect(collector.platform).toBe(platform);
      expect(collector.docUrl).toBe(`https://apify.com/${collector.actorId}`);
    }
  });

  it("caps every run at its estimate plus a margin, never below the actor's minimum", () => {
    expect(chargeCap(0.1, 0.5)).toBe(0.5);
    expect(chargeCap(1, 0.5)).toBe(1.25);
    for (const collector of Object.values(COLLECTORS))
      for (const run of collector.plan([place, other], options)) {
        expect(run.maxTotalChargeUsd).toBeGreaterThanOrEqual(run.estimatedUsd);
        expect(run.actorId).toBe(collector.actorId);
        expect(run.queries.length).toBeGreaterThan(0);
      }
  });

  it("Google Maps asks for one place per search, reviews by relevance and no photos or contacts", () => {
    const [run] = googleReviews.plan([place, other], options);
    expect(run!.input).toEqual({
      searchStringsArray: ["架空珈琲 試験堂 長崎", "試験湯 長崎"],
      maxCrawledPlacesPerSearch: 1,
      language: "ja",
      maxReviews: 5,
      reviewsSort: "mostRelevant",
      reviewsOrigin: "google",
      scrapeReviewsPersonalData: true,
      maxImages: 0,
      scrapeContacts: false,
    });
    expect(run!.maxTotalChargeUsd).toBe(0.5);
  });

  it("batches places, except Facebook which searches one place per run", () => {
    const places = Array.from({ length: 45 }, (_, i) => ({
      ...place,
      placeId: `p${i}`,
      slug: `s${i}`,
    }));
    expect(googleReviews.plan(places, options)).toHaveLength(3);
    expect(tiktok.plan(places, options)).toHaveLength(3);
    expect(reddit.plan(places, { perPlace: 5, batchSize: 100 })).toHaveLength(2);
    expect(facebook.plan(places, options)).toHaveLength(45);
  });

  it("builds keywords the Instagram actor accepts", () => {
    expect(instagramKeyword('Café "Mock" & Co. (test)')).toBe("Café Mock Co test");
    expect(instagram.plan([place], options)[0]!.input).toMatchObject({
      hashtags: ["架空珈琲 試験堂 長崎"],
      keywordSearch: true,
      resultsType: "posts",
      resultsLimit: 5,
    });
  });

  it("Reddit searches the English name with the city, else the Japanese one", () => {
    expect(reddit.plan([place, other], options)[0]!.input).toMatchObject({
      searchTerms: ['"Fictional Test Coffee House" Nagasaki', "試験湯 長崎"],
      searchPosts: true,
      searchComments: true,
      includeNSFW: false,
      crawlCommentsPerPost: false,
    });
  });
});

describe("normalise", () => {
  const ctx = { runId: "mockrun1", collectionId: "mock-collection-1" };

  it("Google reviews: keeps reviews of the place near our pin, never stars or likes", () => {
    const run = googleReviews.plan([place], options)[0]!;
    const review = {
      name: "Mock Reviewer",
      text: TEXT,
      publishedAtDate: "2026-10-01T00:00:00.000Z",
      reviewUrl: "https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1sMOCKREVIEW1",
      reviewerUrl: "https://www.google.com/maps/contrib/000000000000000000001",
      originalLanguage: "ja",
      stars: 5,
      likesCount: 12,
    };
    const near = {
      searchString: "架空珈琲 試験堂 長崎",
      title: "架空珈琲 試験堂",
      totalScore: 4.8,
      location: { lat: 32.7501, lng: 129.8702 },
      reviews: [review, { ...review, text: "" }],
    };
    const far = {
      ...near,
      location: { lat: 33.2, lng: 130.4 },
      reviews: [{ ...review, reviewUrl: `${review.reviewUrl}X` }],
    };
    const candidates = googleReviews.normalise(
      [near, far, { searchString: "unrelated" }],
      run,
      ctx,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      platform: "google_reviews",
      url: review.reviewUrl,
      canonicalUrl: expect.any(String),
      authorName: "Mock Reviewer",
      authorUrl: review.reviewerUrl,
      postedAt: Date.parse("2026-10-01T00:00:00.000Z"),
      text: TEXT,
      langGuess: "ja",
      placeId: "mockplace1",
      searchedFor: "架空珈琲 試験堂",
      query: "架空珈琲 試験堂 長崎",
      actorId: "compass/crawler-google-places",
      runId: "mockrun1",
      collectionId: "mock-collection-1",
      // Google's own name for the place it matched, within 300 m of our pin.
      title: "架空珈琲 試験堂",
      locationName: "架空珈琲 試験堂",
    });
    expect(JSON.stringify(candidates)).not.toMatch(/stars|likes|totalScore|4\.8/);
  });

  it("Google reviews: with no pin, the name Google found must be ours", () => {
    const run = googleReviews.plan([other], options)[0]!;
    const item = (title: string) => ({
      searchString: "試験湯 長崎",
      title,
      location: { lat: 32.7, lng: 129.8 },
      reviews: [
        {
          name: "Mock",
          text: "試験湯のテスト用の架空の口コミ。",
          reviewUrl: `https://www.google.com/maps/reviews/${title}`,
        },
      ],
    });
    expect(googleReviews.normalise([item("試験湯"), item("別の湯")], run, ctx)).toHaveLength(1);
  });

  it("Google reviews: the listing's name becomes the title, and review markup is cleaned", () => {
    const run = googleReviews.plan([place], options)[0]!;
    const item = {
      searchString: "架空珈琲 試験堂 長崎",
      title: "試験堂 &amp; 珈琲",
      location: { lat: 32.7501, lng: 129.8702 },
      reviews: [
        {
          name: "Mock",
          text: "初めて行きました。<br><br>店主は&quot;焙煎&quot;の話をしてくれました。<br/>&lt;br&gt;は消えません",
          reviewUrl: "https://www.google.com/maps/reviews/data=MOCK2",
        },
      ],
    };
    // 試験堂 is a part of the place's name, so the listing is the place.
    const [candidate] = googleReviews.normalise([item], run, ctx);
    expect(candidate!.text).toBe(
      '初めて行きました。\n\n店主は"焙煎"の話をしてくれました。\n<br>は消えません',
    );
    expect(candidate).toMatchObject({ title: "試験堂 & 珈琲", locationName: "試験堂 & 珈琲" });
  });

  describe("which Google listing is the place", () => {
    const planned = (names: string[], pin: PlannedQuery["pin"]): PlannedQuery => ({
      placeId: "mockplace9",
      slug: "fictional-place-9",
      query: "q",
      searchedFor: names[0]!,
      names,
      pin,
    });
    const pin = { lat: 32.75, lng: 129.87 };
    /** A point this many metres due north of the pin (1 degree of latitude is 111,195 m). */
    const north = (metres: number) => ({ lat: pin.lat + metres / 111_195, lng: pin.lng });
    const listing = (title: string, metres: number, extra: Record<string, unknown> = {}) => ({
      title,
      location: north(metres),
      ...extra,
    });

    it("takes a near listing whose name fits: the whole name, a part of it, or old-form kanji", () => {
      const names = ["架空餃子専門店 カクウの門 Kakunomon"];
      expect(judgeListing(listing("カクウの門", 14), planned(names, pin))).toBeNull();
      expect(judgeListing(listing("中華料理架空樓", 5), planned(["架空楼"], pin))).toBeNull();
      expect(judgeListing(listing("架空 桃華園", 7), planned(["架空桃華園"], pin))).toBeNull();
    });

    it("leaves out a near listing with another name, and one over 300 m with only part of the name", () => {
      const names = ["架空餃子専門店 カクウの門 Kakunomon"];
      expect(judgeListing(listing("別の店", 10), planned(names, pin))).toBe("wrong_listing");
      expect(judgeListing(listing("カクウの門", 900), planned(names, pin))).toBe("wrong_listing");
    });

    it("takes a listing that only shares a shorter name when it is at the same door", () => {
      const names = ["中華菜館 架空"];
      expect(judgeListing(listing("架空", 9), planned(names, pin))).toBeNull();
      expect(judgeListing(listing("架空 本店", 26), planned(names, pin))).toBeNull();
      expect(judgeListing(listing("架空", 150), planned(names, pin))).toBe("wrong_listing");
      // A district or a building nearby is not the shop.
      expect(judgeListing(listing("中華街", 20), planned(["老架 中華街店"], pin))).toBe(
        "wrong_listing",
      );
      expect(judgeListing(listing("カクウプラザ 本館", 20), planned(names, pin))).toBe(
        "wrong_listing",
      );
    });

    it("takes no listing over 300 m away, whatever its name", () => {
      // A branch, or a shop of exactly this name: each has its own entry on the map.
      expect(judgeListing(listing("架空屋 本店", 301), planned(["架空屋"], pin))).toBe(
        "wrong_listing",
      );
      expect(
        judgeListing(listing("カステラ本家 架空屋 長崎本店", 1_276), planned(["架空屋"], pin)),
      ).toBe("wrong_listing");
      expect(judgeListing(listing("架空屋", 959), planned(["架空屋"], pin))).toBe("wrong_listing");
    });

    it("lets position decide when the place has a one-character name", () => {
      expect(
        judgeListing(listing("ダイニングバー架", 10), planned(["Kakuu", "架"], pin)),
      ).toBeNull();
      expect(judgeListing(listing("架の店", 900), planned(["Kakuu", "架"], pin))).toBe(
        "wrong_listing",
      );
    });

    it("with no pin the name must fit, and a listing with no point is not the place", () => {
      expect(judgeListing({ title: "架空屋 本店" }, planned(["架空屋"], null))).toBeNull();
      expect(judgeListing({ title: "別の店" }, planned(["架空屋"], null))).toBe("wrong_listing");
      expect(judgeListing({ title: "架空屋" }, planned(["架空屋"], pin))).toBe("wrong_listing");
    });

    it("a permanently closed listing of the place is closed_listing; a closed one that is not the place is wrong", () => {
      expect(
        judgeListing(listing("架空屋", 31, { permanentlyClosed: true }), planned(["架空屋"], pin)),
      ).toBe("closed_listing");
      expect(
        judgeListing(listing("別の店", 31, { permanentlyClosed: true }), planned(["架空屋"], pin)),
      ).toBe("wrong_listing");
      expect(
        judgeListing(listing("架空屋", 31, { temporarilyClosed: true }), planned(["架空屋"], pin)),
      ).toBeNull();
    });

    it("normalise counts the reviews it leaves out and names the listings and places", () => {
      const run = googleReviews.plan([place], options)[0]!;
      const reviews = (n: number, tag: string) =>
        Array.from({ length: n }, (_, i) => ({
          name: "Mock",
          text: `架空珈琲 試験堂のテスト用の口コミ ${tag}${i}`,
          reviewUrl: `https://www.google.com/maps/reviews/data=${tag}${i}`,
        }));
      const base = { searchString: "架空珈琲 試験堂 長崎" };
      const items = [
        { ...base, title: "架空珈琲 試験堂", location: north(20), reviews: reviews(2, "ok") },
        { ...base, title: "別の喫茶", location: north(20), reviews: reviews(3, "wrong") },
        {
          ...base,
          title: "架空珈琲 試験堂",
          location: north(40),
          permanentlyClosed: true,
          reviews: reviews(2, "closed"),
        },
      ].map((item) => ({ ...item, location: item.location }));
      // The place's pin is (32.75, 129.87), the one these points are measured from.
      const tally = newListingTally();
      const kept = googleReviews.normalise(items, run, { ...ctx, listings: tally });
      expect(kept).toHaveLength(2);
      expect(tally).toMatchObject({ wrongListing: 3, closedListing: 2 });
      expect(tally.excluded.map((e) => e.problem)).toEqual([
        "wrong_listing",
        "wrong_listing",
        "wrong_listing",
        "closed_listing",
        "closed_listing",
      ]);
      expect(tally.excluded.every((e) => e.placeId === "mockplace1")).toBe(true);
      expect(summariseListings(tally)).toEqual({
        wrongListing: 3,
        closedListing: 2,
        wrongListings: [
          { place: "架空珈琲 試験堂", slug: "fictional-test-coffee", listing: "別の喫茶" },
        ],
        closedPlaces: [
          { place: "架空珈琲 試験堂", slug: "fictional-test-coffee", listing: "架空珈琲 試験堂" },
        ],
      });
      // Without a tally the reviews are still left out.
      expect(googleReviews.normalise(items, run, ctx)).toHaveLength(2);
    });
  });

  it("plainText turns <br> into line breaks, then decodes entities", () => {
    expect(plainText("a<br>b<BR />c<br/>d")).toBe("a\nb\nc\nd");
    expect(plainText("A &amp; B &lt;br&gt; &#39;x&#39;")).toBe("A & B <br> 'x'");
  });

  it("Instagram: matches the keyword back to the place and credits the account", () => {
    const run = instagram.plan([place], options)[0]!;
    const post = {
      inputUrl: "https://www.instagram.com/explore/search/keyword/?q=架空珈琲 試験堂 長崎",
      url: "https://www.instagram.com/p/MOCKPOST1/",
      caption: TEXT,
      ownerUsername: "mock_author",
      timestamp: "2026-10-02T03:04:05.000Z",
      likesCount: 99,
      locationName: "架空珈琲 試験堂",
    };
    const [candidate, ...rest] = instagram.normalise(
      [
        post,
        { ...post },
        {
          ...post,
          url: undefined,
          shortCode: "MOCKPOST2",
          searchTerm: "架空珈琲 試験堂 長崎",
          inputUrl: undefined,
        },
      ],
      run,
      ctx,
    );
    expect(candidate).toMatchObject({
      platform: "instagram",
      url: "https://www.instagram.com/p/MOCKPOST1/",
      authorHandle: "mock_author",
      authorUrl: "https://www.instagram.com/mock_author/",
      postedAt: Date.parse("2026-10-02T03:04:05.000Z"),
      placeId: "mockplace1",
      collectionId: "mock-collection-1",
    });
    expect(candidate!.locationName).toBe("架空珈琲 試験堂");
    expect(JSON.stringify(candidate)).not.toMatch(/likes|99/);
    expect(rest.map((c) => c.url)).toEqual(["https://www.instagram.com/p/MOCKPOST2/"]);
  });

  it("Facebook: one place per run, author from the user or the page", () => {
    const run = facebook.plan([place], options)[0]!;
    const [a, b] = facebook.normalise(
      [
        {
          url: "https://www.facebook.com/mockpage/posts/1000001",
          text: TEXT,
          time: "2026-10-03T00:00:00.000Z",
          user: { name: "Mock Page", profileUrl: "https://www.facebook.com/mockpage" },
        },
        {
          url: "https://www.facebook.com/mockpage/posts/1000002",
          text: TEXT,
          pageName: "Mock Page 2",
        },
        { url: "https://www.facebook.com/mockpage/posts/1000003", text: "" },
      ],
      run,
      ctx,
    );
    expect(a).toMatchObject({
      authorName: "Mock Page",
      authorUrl: "https://www.facebook.com/mockpage",
    });
    expect(b).toMatchObject({ authorName: "Mock Page 2", placeId: "mockplace1" });
  });

  it("TikTok: skips error items and credits the account", () => {
    const run = tiktok.plan([place], options)[0]!;
    const candidates = tiktok.normalise(
      [
        { error: "No results", errorCode: "NO_RESULTS", searchQuery: "架空珈琲 試験堂 長崎" },
        {
          searchQuery: "架空珈琲 試験堂 長崎",
          webVideoUrl: "https://www.tiktok.com/@mock_author/video/7000000000000000001",
          text: TEXT,
          textLanguage: "ja",
          createTimeISO: "2026-10-04T00:00:00.000Z",
          authorMeta: { name: "mock_author", profileUrl: "https://www.tiktok.com/@mock_author" },
          diggCount: 1000,
        },
      ],
      run,
      ctx,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      platform: "tiktok",
      authorHandle: "@mock_author",
      langGuess: "ja",
      postedAt: Date.parse("2026-10-04T00:00:00.000Z"),
    });
  });

  it("Reddit: posts and comments, credited as u/name", () => {
    const run = reddit.plan([place], options)[0]!;
    const term = '"Fictional Test Coffee House" Nagasaki';
    const candidates = reddit.normalise(
      [
        {
          dataType: "post",
          searchTerm: term,
          postUrl: "https://www.reddit.com/r/mocktravel/comments/mock01/fictional_test/",
          title: "Fictional Test Coffee House",
          body: "A made-up post for tests: the owner roasts every morning.",
          authorName: "mock_user",
          createdAt: "2026-10-05T00:00:00.000Z",
        },
        {
          dataType: "comment",
          searchTerm: term,
          url: "https://www.reddit.com/r/mocktravel/comments/mock01/fictional_test/mockc1/",
          body: "Fictional Test Coffee House opens at nine (test comment).",
          authorName: "mock_user2",
          commentCreatedAt: "2026-10-06T00:00:00.000Z",
        },
        { dataType: "community", searchTerm: term },
      ],
      run,
      ctx,
    );
    expect(candidates.map((c) => c.authorHandle)).toEqual(["u/mock_user", "u/mock_user2"]);
    expect(candidates[0]!.text).toBe(
      "Fictional Test Coffee House\n\nA made-up post for tests: the owner roasts every morning.",
    );
    expect(candidates[1]!.authorUrl).toBe("https://www.reddit.com/user/mock_user2/");
    expect(candidates[0]!.title).toBe("Fictional Test Coffee House");
    expect(candidates[1]!.title).toBeUndefined();
  });

  it("Web: keeps blog results, skips platforms and listing sites, then builds candidates from the page", () => {
    const run = web.plan([place], options)[0]!;
    const hits = web.hits(
      [
        {
          searchQuery: { term: '"架空珈琲 試験堂" 長崎 ブログ' },
          organicResults: [
            { url: "https://blog.example.com/mock-entry", title: "Mock blog" },
            { url: "https://tabelog.com/nagasaki/mock/" },
            { url: "https://www.instagram.com/p/MOCK/" },
            { url: "ftp://example.com/file" },
          ],
        },
      ],
      run,
      5,
    );
    expect(hits.map((hit) => hit.url)).toEqual(["https://blog.example.com/mock-entry"]);
    expect(web.normalise([], run, ctx)).toEqual([]);
    expect(webCandidate(hits[0]!, { text: TEXT }, run, ctx)).toMatchObject({
      platform: "web",
      url: "https://blog.example.com/mock-entry",
      authorName: "blog.example.com",
      title: "Mock blog",
      placeId: "mockplace1",
      collectionId: "mock-collection-1",
    });
    // After a redirect the post is credited at the address the page was read from.
    expect(
      webCandidate(hits[0]!, { url: "https://www.example.org/moved-entry", text: TEXT }, run, ctx),
    ).toMatchObject({ url: "https://www.example.org/moved-entry", authorName: "www.example.org" });
  });
});
