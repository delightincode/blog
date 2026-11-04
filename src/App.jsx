import React, { useEffect, useState } from "react";

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
    .join(" ");
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
                      <span>Free writing</span>
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
                      {nodes.map((node, index) => {
                        if (!isSelectedArticle) return null;
                        if (node.nodeType === "paragraph") {
                          const text = textFromNode(node);
                          return text ? <p key={index}>{text}</p> : null;
                        }

                        if (node.nodeType === "embedded-asset-block") {
                          const assetId = node.data?.target?.sys?.id;
                          const asset = assets[assetId];
                          return asset ? (
                            <img key={index} src={asset.url} alt={asset.title} loading="lazy" />
                          ) : null;
                        }

                        return null;
                      })}
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
          <a href="#">GitHub</a>
          <a href="#">LinkedIn</a>
          <a href="#">RSS</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
