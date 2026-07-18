import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';
import elikhaTablet from '../../assets/images/elikhaTablet.png';
import elikhaLaptop from '../../assets/images/ElikhaLaptop.png';
import elikhaProgress from '../../assets/images/ElikhaProgress.png';
import artistPalette from '../../assets/hero-real/artist-palette.svg';
import paintbrush from '../../assets/hero-real/paintbrush.svg';
import crayon from '../../assets/hero-real/crayon.svg';
import pencil from '../../assets/hero-real/pencil.svg';
import scissors from '../../assets/hero-real/scissors.svg';
import notebook from '../../assets/hero-real/notebook-with-decorative-cover.svg';
import memo from '../../assets/hero-real/memo.svg';
import straightRuler from '../../assets/hero-real/straight-ruler.svg';
import triangularRuler from '../../assets/hero-real/triangular-ruler.svg';
import sparkles from '../../assets/hero-real/sparkles.svg';

const features = [
  {
    title: 'Interactive Learning',
    description: 'Follow guided step-by-step arts and crafts activities with voice-assisted instructions',
    details: [
      'Includes visual guides and step indicators for each task.',
      'Supports guided and exploratory activity flow for Grades 1 to 6.',
      'Encourages students to create outputs using their own ideas.',
    ],
    hoverImage: elikhaTablet,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </svg>
    ),
  },
  {
    title: 'AR Technology',
    description: 'Experience augmented reality that makes learning more immersive and fun',
    details: [
      'Displays 3D craft elements in the real-world environment.',
      'Lets students resize, rotate, move, and arrange digital objects.',
      'Designed for mobile and web access in classroom learning.',
    ],
    hoverImage: elikhaLaptop,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
        <path d="M10 6.5h4" />
        <path d="M11.3 14.7l1.2-3.1 1.2 3.1" />
        <path d="M11 16h3" />
      </svg>
    ),
  },
  {
    title: 'Track Progress',
    description: 'Monitor your artistic journey and achievements as you create',
    details: [
      'Helps teachers monitor participation and completed activities.',
      'Organizes learner progress within guided activity sessions.',
      'Supports class and content management for arts instruction.',
    ],
    hoverImage: elikhaProgress,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M7 14.5l3.2-3.2 3 2.4 4.8-5.2" />
        <path d="M16.7 8.5H19v2.3" />
      </svg>
    ),
  },
];

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      {/* Hero Section */}
      <section className="page-section hero-page">
        <div className="hero-section">
          <div className="craft-motion-layer" aria-hidden="true">
            <span className="craft-item craft-thread" />
            <span className="craft-item craft-thread craft-thread-alt" />
            <span className="craft-online craft-online-palette">
              <img src={artistPalette} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-brush">
              <img src={paintbrush} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-crayon">
              <img src={crayon} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-pencil">
              <img src={pencil} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-scissors">
              <img src={scissors} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-ruler">
              <img src={straightRuler} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-ruler-triangle">
              <img src={triangularRuler} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-sparkles">
              <img src={sparkles} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-memo">
              <img src={memo} alt="" className="craft-online-icon" />
            </span>
            <span className="craft-online craft-online-book">
              <img src={notebook} alt="" className="craft-online-icon" />
            </span>
          </div>
          <h1 className="hero-title">E-Likha</h1>
          <p className="hero-subtitle">AR-Powered Arts & Crafts Simulator</p>
          <p className="hero-description">
            Immerse yourself in Filipino culture through interactive art and craft experiences
          </p>
          <button onClick={() => navigate('/login')} className="cta-button">
            Get Started
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="page-section features-section" id="features">
        <div className="container">
          <h2 className="section-title">Why Choose E-Likha?</h2>
          <div className="features-grid">
            {features.map((feature) => (
              <div className="feature-card" key={feature.title}>
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <div className="feature-hover-details" aria-hidden="true">
                  <img src={feature.hoverImage} alt="" className="feature-hover-image" />
                  <p>{feature.description}</p>
                  <div className="feature-extra">
                    {feature.details.map((detail) => (
                      <p key={detail} className="feature-extra-item">
                        {detail}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About + Footer Section */}
      <section className="page-section about-page" id="about">
        <div className="about-section">
          <div className="container">
            <h2 className="section-title">About E-Likha</h2>
            <p className="about-text">
              E-Likha is a mobile and web-based arts and crafts simulator with Augmented Reality designed for
              elementary learners. It provides guided step-by-step activities, voice-assisted instructions, and
              interactive three-dimensional craft elements that students can move, rotate, resize, and arrange to
              create their own outputs.
            </p>
          </div>
        </div>
        <footer className="footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-section">
                <h3>E-Likha</h3>
                <p>Empowering creativity through technology</p>
              </div>
              <div className="footer-section">
                <h4>Quick Links</h4>
                <a href="#features">Features</a>
                <a href="#about">About</a>
                <button onClick={() => navigate('/login')}>Login</button>
              </div>
              <div className="footer-section">
                <h4>Contact</h4>
                <p>elikha2026@gmail.com</p>
                <p>&copy; 2026 E-Likha. All rights reserved.</p>
              </div>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default LandingPage;
