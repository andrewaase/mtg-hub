import { useState, useEffect } from 'react'
import { fetchNews } from '../lib/utils'

export default function News({ showToast }) {
  const [source, setSource] = useState('mtggoldfish')
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadNews(source)
  }, [source])

  const loadNews = async (src) => {
    setLoading(true)
    try {
      const news = await fetchNews(src)
      setArticles(news)
      if (news.length === 0) showToast('No articles found')
    } catch (err) {
      showToast('Failed to load news')
    }
    setLoading(false)
  }

  const SOURCE_LABELS = {
    mtggoldfish: 'MTGGoldfish',
    edhrec:      'EDHREC',
    community:   'r/magicTCG',
  }

  return (
    <div>
      <div className="tabs">
        {[
          { id: 'mtggoldfish', label: 'MTGGoldfish' },
          { id: 'edhrec',      label: 'EDHREC'      },
          { id: 'community',   label: 'r/magicTCG'  },
        ].map(s => (
          <button key={s.id} className={`tab ${source === s.id ? 'active' : ''}`} onClick={() => setSource(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="news-loading">
          <div className="spinner"></div>
          <p>Loading news...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {articles.map((article, i) => (
            <a key={i} href={article.link} target="_blank" rel="noopener noreferrer" className="news-card">
              {article.image && <img src={article.image} alt="" className="news-img" />}
              <div style={{ flex: 1 }}>
                <div className="news-title">{article.title}</div>
                <div className="news-meta">
                  <span className="news-source">{SOURCE_LABELS[source] || source}</span>
                  <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                    {new Date(article.pubDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
