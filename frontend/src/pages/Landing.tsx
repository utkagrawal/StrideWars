import React from 'react';
import { Link } from 'react-router-dom';
import { DemoLoginButton } from './Login';

export const Landing = () => (
  <section className="landing">
    <div>
      <h1>
        Run a loop.
        <br />
        <mark>Keep</mark> what&apos;s inside.
      </h1>
      <p className="lead">
        StrideWars turns your neighbourhood into a game board. Every loop you run claims the streets
        inside it. Cut through someone else&apos;s ground and it&apos;s yours, until they run it
        back.
      </p>
      <div className="landing-actions">
        <DemoLoginButton className="btn btn-lime btn-lg" />
        <Link to="/register" className="btn btn-secondary btn-lg">
          Create an account
        </Link>
      </div>

      <ol className="how">
        <li>
          <span>
            <strong>Run a closed loop</strong> with GPS, or plan one on the map.
          </span>
        </li>
        <li>
          <span>
            <strong>Every cell inside is yours.</strong> The map is a grid of 34 × 19 m cells.
          </span>
        </li>
        <li>
          <span>
            <strong>Take ground from rivals</strong> and climb the leaderboard. They get an alert.
          </span>
        </li>
      </ol>
    </div>

    <img
      className="landing-shot"
      src="/landing-map.png"
      alt="The StrideWars map: coloured territory around a campus, with a freshly run loop"
    />
  </section>
);
