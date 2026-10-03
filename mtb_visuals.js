// Artwork cropped from MTB.pdf. Visual assets never change the counter geometry.
const MTBVisuals = {
    counters: {}, chart: null,
    key(ship) {
        const names={'MTB':'mtb','MGB':'mgb','E-Boat':'e-boat','R-Boat':'r-boat','Trawler (Br)':'british-trawler','Trawler (Ger)':'german-trawler','Tanker':'tanker','F-Lighter':'f-lighter'};
        return ship.type.name==='Transport'?`transport-${ship.transportNumber||1}`:names[ship.type.name];
    },
    image(ship) { return this.counters[this.key(ship)]; },
    sync(game) {
        this.game=game;
        document.body.dataset.phase=game.phase;
        for(const side of ['british','german']) {
            const patchButton=document.getElementById(`place-${side}-patch`);
            if(patchButton) patchButton.hidden=!['MIST','FOG'].includes(game.visibilityMode);
        }
        const omit=document.getElementById('omitted-transport');
        if(omit) omit.closest('label').hidden=document.getElementById('scenario-select').value!=='GERMAN_CONVOY';
        const ship=game.selectedShip;
        const actions={
            'fire-btn':['FIRE_FIRST','FIRE_SECOND'].includes(game.phase),
            'torpedo-btn':['ORDERS','TORPEDO_ORDERS'].includes(game.phase)&&ship?.type.torpedoes>0,
            'depth-btn':game.phase==='ORDERS'&&ship?.type.depthCharges>0,
            'illum-btn':game.phase==='TORPEDO_ORDERS'&&game.visibilityMode==='NIGHT',
            'sight-btn':game.phase==='SIGHTING',
            'cancel-attacks':['ORDERS','TORPEDO_ORDERS'].includes(game.phase)
        };
        for(const [id,visible] of Object.entries(actions)) {
            const button=document.getElementById(id);
            if(button) {
                button.hidden=!visible;
                const row=button.closest('.attack-row');
                if(row) row.hidden=!visible;
            }
        }
        const gauge=document.getElementById('buoyancy-fill');
        if(gauge&&game.selectedShip) {
            const ratio=game.selectedShip.currentBuoyancy/game.selectedShip.startingBuoyancy;
            gauge.setAttribute('width',String(240*Math.max(0,Math.min(1,ratio))));
            gauge.setAttribute('fill',ratio<.3?'#a43e32':'#536d69');
            document.getElementById('hull-gauge').hidden=!game.identifiedFor(game.viewFaction,game.selectedShip);
        }
        const art=document.getElementById('vessel-art');
        if(art&&game.selectedShip) {
            const visible=game.identifiedFor(game.viewFaction,game.selectedShip);
            art.hidden=!visible;
            if(visible) art.src=`assets/counters/${this.key(game.selectedShip)}.png`;
        }
        const hint=document.getElementById('selection-hint');
        if(hint) hint.hidden=!!game.selectedShip;
        const settings=document.querySelector('.battle-settings');
        if(settings&&this.lastPhase!==game.phase) settings.open=game.phase==='SETUP';
        this.lastPhase=game.phase;
    }
};
if(typeof Image!=='undefined') {
    for(const name of ['mtb','mgb','e-boat','r-boat','british-trawler','german-trawler','tanker','f-lighter','transport-1','transport-2','transport-3','transport-4','fire','torpedo']) {
        const img=new Image();img.src=`assets/counters/${name}.png`;MTBVisuals.counters[name]=img;
    }
    MTBVisuals.chart=new Image();MTBVisuals.chart.src='assets/water-chart.svg';
    document.addEventListener('DOMContentLoaded',()=>{
        let zoom=1;
        const change=delta=>{
            zoom=Math.max(1,Math.min(3,zoom+delta));
            const chart=document.getElementById('game-canvas'),viewport=document.getElementById('chart-viewport');
            chart.style.width=`${zoom*100}%`;
            if(delta!==0) {
                const ship=MTBVisuals.game?.selectedShip;
                viewport.scrollLeft=(ship?ship.x/1600:.5)*chart.clientWidth-viewport.clientWidth/2;
                viewport.scrollTop=(ship?ship.y/1200:.5)*chart.clientHeight-viewport.clientHeight/2;
            }
            document.getElementById('zoom-label').textContent=`${Math.round(zoom*100)}%`;
            document.getElementById('zoom-out').disabled=zoom===1;
            document.getElementById('zoom-in').disabled=zoom===3;
        };
        document.getElementById('zoom-in').onclick=()=>change(.5);
        document.getElementById('zoom-out').onclick=()=>change(-.5);
        change(0);
    });
}
