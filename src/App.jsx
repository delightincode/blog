import React, { useEffect, useState } from "react";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { BLOCKS, MARKS } from "@contentful/rich-text-types";

let runtimeConfigPromise;
let articlesPromise;

function contentfulUrl(config, path, params = {}) {
  const base = `https://cdn.contentful.com/spaces/${config.space}/environments/${config.environment}`;
  const searchParams = new URLSearchParams({
    access_token: config.token,
    ...params,
  });
  return `${base}/${path}?${searchParams}`;
}

async function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch("/runtime-config.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}`);
      return response.json();
    }).catch((error) => {
      runtimeConfigPromise = undefined;
      throw error;
    });
  }

  return runtimeConfigPromise;
}

async function loadArticles(contentful) {
  if (!articlesPromise) {
    articlesPromise = fetch(contentfulUrl(contentful, "entries", {
      content_type: "freeWriting",
      include: "2",
      order: "-sys.createdAt",
    })).then((response) => {
      if (!response.ok) throw new Error(`Contentful returned ${response.status}`);
      return response.json();
    }).catch((error) => {
      articlesPromise = undefined;
      throw error;
    });
  }

  return articlesPromise;
}

function textFromNode(node) {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(textFromNode).join("");
}

function previewFromNodes(nodes) {
  return nodes
    .filter((node) => node.nodeType === "paragraph")
    .map(textFromNode)
    .filter(Boolean)
    .join("\n");
}

function youtubeEmbedUrl(value) {
  if (typeof value !== "string") return null;

  const iframeSource = value.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
  const htmlDecoded = iframeSource ?? value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = htmlDecoded;
  const decoded = textarea.value.trim();

  let url;
  try {
    url = new URL(decoded);
  } catch {
    const videoMatch = decoded.match(/(?:youtube\.com|youtu\.be)\/[^\s<>"']+/i);
    if (!videoMatch) return null;
    try {
      url = new URL(videoMatch[0].startsWith("http") ? videoMatch[0] : `https://${videoMatch[0]}`);
    } catch {
      return null;
    }
  }

  const host = url.hostname.replace(/^www\./, "");
  let videoId;
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0];
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) videoId = parts[1];
    }
  }

  return /^[A-Za-z0-9_-]{11}$/.test(videoId ?? "")
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : null;
}

function YouTubeEmbed({ url, title = "YouTube video player" }) {
  if (!youtubeEmbedUrl(url)) return null;

  return (
    <div className="youtube-embed">
      <iframe
        src={youtubeEmbedUrl(url)}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}

function ContentfulRichText({ document, assets }) {
  const options = {
    renderMark: {
      [MARKS.CODE]: (text) => <code>{text}</code>,
      [MARKS.UNDERLINE]: (text) => <u>{text}</u>,
      [MARKS.SUPERSCRIPT]: (text) => <sup>{text}</sup>,
      [MARKS.SUBSCRIPT]: (text) => <sub>{text}</sub>,
      [MARKS.STRIKETHROUGH]: (text) => <s>{text}</s>,
    },
    renderNode: {
      [BLOCKS.PARAGRAPH]: (node, children) => {
        const text = textFromNode(node);
        const embedUrl = youtubeEmbedUrl(text);
        return embedUrl ? (
          <div className="youtube-embed">
            <iframe
              src={embedUrl}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : (
          <p>{children}</p>
        );
      },
      [BLOCKS.EMBEDDED_ASSET]: (node) => {
        const assetId = node.data?.target?.sys?.id;
        const asset = node.data?.target?.fields
          ? {
              url: node.data.target.fields.file.url.startsWith("//")
                ? `https:${node.data.target.fields.file.url}`
                : node.data.target.fields.file.url,
              title: node.data.target.fields.title || "",
            }
          : assets[assetId];

        return asset ? <img src={asset.url} alt={asset.title} loading="lazy" /> : null;
      },
    },
  };

  return documentToReactComponents(document, options);
}

function App() {
  const [entries, setEntries] = useState([]);
  const [assets, setAssets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState(() => {
    const match = window.location.hash.match(/^#article\/(.+)$/);
    return match ? match[1] : null;
  });
  const [showAbout, setShowAbout] = useState(() => window.location.hash === "#about");

  useEffect(() => {
    function updateSelectedArticle() {
      const match = window.location.hash.match(/^#article\/(.+)$/);
      setSelectedArticleId(match ? match[1] : null);
      setShowAbout(window.location.hash === "#about");
    }

    window.addEventListener("hashchange", updateSelectedArticle);
    return () => window.removeEventListener("hashchange", updateSelectedArticle);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadEntries() {
      try {
        const contentful = await loadRuntimeConfig();
        const data = await loadArticles(contentful);
        const loadedAssets = {};
        for (const asset of data.includes?.Asset ?? []) {
            const fileUrl = asset.fields.file.url.startsWith("//")
              ? `https:${asset.fields.file.url}`
              : asset.fields.file.url;
            loadedAssets[asset.sys.id] = {
              url: fileUrl,
              title: asset.fields.title || "",
            };
        }

        if (active) {
          setEntries(data.items ?? []);
          setAssets(loadedAssets);
        }
      } catch (requestError) {
        if (active) setError("The article could not be loaded from Contentful.");
        console.error(requestError);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadEntries();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="shell">
      <header className="site-header">
        <a className="brand" href="#articles" aria-label="The Free Writers home">
          <span className="brand-mark">FW</span>
          <span>the free writers</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={!showAbout ? "active" : ""} href="#articles">Articles</a>
          <a className={showAbout ? "active" : ""} href="#about">About</a>
        </nav>
      </header>

      <main>
        <section className="content-grid" id="articles">
          <div>
            {showAbout ? (
              <section className="about-page">
                <p className="sidebar-label">About me</p>
                <h1>Pham Huu Tuan</h1>
                <p className="about-page-headline">Frontend / Software Engineer</p>
                <p>
                  Software Engineer with nearly 10 years of experience building web applications,
                  frontend platforms, and shared developer tooling. Combines product thinking
                  with engineering discipline to help teams deliver scalable, customer-focused
                  software.
                </p>
                <dl>
                  <div>
                    <dt>Location</dt>
                    <dd>Ho Chi Minh City, Vietnam</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd><a href="mailto:tuanph.tf@gmail.com">tuanph.tf@gmail.com</a></dd>
                  </div>
                </dl>
                <div className="about-page-links">
                  <a href="https://www.linkedin.com/in/tuan-pham-5526b9243/" target="_blank" rel="noreferrer">
                    LinkedIn <span>↗</span>
                  </a>
                  <a href="https://github.com/delightincode" target="_blank" rel="noreferrer">
                    GitHub <span>↗</span>
                  </a>
                </div>
              </section>
            ) : (
            <>
            <div className="post-list" aria-live="polite">
              {loading && <p className="content-status">Loading articles...</p>}
              {error && <p className="content-status">{error}</p>}

              {entries.map((entry, entryIndex) => {
                const nodes = entry.fields.content?.content ?? [];
                const isSelectedArticle = selectedArticleId === entry.sys.id;
                if (selectedArticleId && !isSelectedArticle) return null;
                return (
                <article className="post-row contentful-post" key={entry.sys.id}>
                  <div className="post-index">{String(entryIndex + 1).padStart(2, "0")}</div>
                  <div className="post-body">
                    <div className="post-meta">
                      <span>{entry.metadata?.tags?.[0]?.sys?.id || "Free writing"}</span>
                      <time dateTime={entry.sys.createdAt}>
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(entry.sys.createdAt))}
                      </time>
                    </div>
                    {isSelectedArticle ? (
                      <h1>{entry.fields.title}</h1>
                    ) : (
                      <h3>
                        <a className="post-title-link" href={`#article/${entry.sys.id}`}>
                          {entry.fields.title}
                        </a>
                      </h3>
                    )}
                    <div className="post-content">
                      {!isSelectedArticle &&
                        nodes.map((node, index) => {
                          if (node.nodeType !== "paragraph") return null;
                          const embedUrl = youtubeEmbedUrl(textFromNode(node));
                          if (!embedUrl) return null;

                          return (
                            <div className="youtube-embed" key={index}>
                              <iframe
                                src={embedUrl}
                                title="YouTube video player"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                              />
                            </div>
                          );
                        })}
                      {isSelectedArticle && entry.fields.content ? (
                        <div className="rich-text">
                          <ContentfulRichText document={entry.fields.content} assets={assets} />
                        </div>
                      ) : null}
                      <YouTubeEmbed
                        url={entry.fields.youtubeUrl}
                        title={entry.fields.youtubeTitle || "YouTube video player"}
                      />
                    </div>
                    {!isSelectedArticle && (
                      <p className="article-preview">{previewFromNodes(nodes)}</p>
                    )}
                  </div>
                </article>
                );
              })}
            </div>
            {selectedArticleId && (
              <a className="archive-link" href="#articles">
                Back to all articles <span>→</span>
              </a>
            )}
            </>
            )}
          </div>

          <aside className="sidebar" id="about">
            <section className="about-card">
              <div className="portrait" aria-label="Minimal portrait illustration">
                <span className="portrait-head"></span>
                <span className="portrait-body"></span>
              </div>
              <h2>Hello, I’m Tuan Pham.</h2>
              <p>
                Frontend / Software Engineer based in Ho Chi Minh City, Vietnam.
              </p>
              <a className="text-link" href="#about">More about me <span>↗</span></a>
            </section>

            <section className="now-card">
              <p className="sidebar-label"><span className="status-dot"></span> Ryokan</p>
              <p>
                The thief left it behind: <br />
                the moon at my window.
              </p>
            </section>
          </aside>
        </section>
      </main>

      <footer>
        <span>© 2026 The Free Writers</span>
        <div>
          <a href="https://github.com/delightincode" target="_blank">GitHub</a>
          <a href="https://www.linkedin.com/in/tuan-pham-5526b9243/" target="_blank">LinkedIn</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
