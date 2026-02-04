import React, { useState } from 'react'
import './Landing.css'

function Landing({ onGo }) {
    var list_itms = [
        { t: 'Security', d: 'Your data is encrypted and protected at all times.' },
        { t: 'Personal Focus', d: 'Perfect for daily todos and small/big projects.' },
        { t: 'Team Collab', d: 'Share subtrees with your team in real time.' }
    ]

    const [tilt, setTilt] = useState({ x: 0, y: 0 })

    function handle_move(e) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width - 0.5
        const y = (e.clientY - rect.top) / rect.height - 0.5
        setTilt({ x: x * 20, y: y * -20 })
    }

    function reset_tilt() {
        setTilt({ x: 0, y: 0 })
    }

    return (
        <div className="main_wrap">
            <nav className="nav_bar fade_up" style={{ animationDelay: '0.1s' }}>
                <div className="lg_txt">Tasky</div>


                <a href="https://github.com/BGtulk-on/TaskyV2" target="_blank" className="gh_lnk" data-tip="Yea, its open source!">GitHub</a>
            </nav>

            <header className="hero_split">
                <div className="hero_left fade_up" style={{ animationDelay: '0.3s' }}>
                    <h1 className="main_titl">
                        Every task can be <span>reduced</span> to smaller ones
                    </h1>
                    <p className="sub_txt">
                        Built for big company projects and personal daily use. Scale your productivity with nested trees and team sharing.
                    </p>

                    <div className="btn_box">
                        <button className="btn_st p_btn pulse_btn" onClick={onGo}>Get Started Now</button>

                        <button className="btn_st pulse_btn btn_guest" onClick={() => { window.location.href = '/guest' }}>Guest Mode</button>
                    </div>
                </div>

                <div className="hero_right fade_up" style={{ animationDelay: '0.5s' }}>
                    <div
                        className="img_card"
                        onMouseMove={handle_move}
                        onMouseLeave={reset_tilt}
                        style={{
                            transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) scale3d(1.05, 1.05, 1.05)`,
                            transition: tilt.x === 0 ? '0.5s' : '0.1s'
                        }}
                    >
                        <div className="img_preview">
                            <img src="/image.png" alt="app preview" />
                        </div>
                    </div>
                </div>
            </header>

            <section className="feat_grid">
                {list_itms.map((x, i) => (
                    <div key={i} className="feat_card fade_up" style={{ animationDelay: (0.7 + i * 0.1) + 's' }}>
                        <div className="c_titl">{x.t}</div>
                        <div className="c_desc">{x.d}</div>
                    </div>
                ))}


            </section>


            <footer className="fade_up" style={{ padding: '32px', opacity: 0.5, fontSize: '14px', animationDelay: '1s' }}>
                © 2026 Tasky | Made with &lt;3 by <a href="https://bgtulk.dev" target="_blank" style={{ color: 'inherit' }}>BGtulk</a> | <a href="https://github.com/BGtulk-on/TaskyV2" target="_blank" style={{ color: 'inherit' }}>GitHub Repo</a>



            </footer>

        </div>
    )
}

export default Landing
