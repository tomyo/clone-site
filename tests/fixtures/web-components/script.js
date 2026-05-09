class MyCarousel extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <div class="wrapper" style="border: 1px solid red; padding: 10px;">
                <h2>Shadow DOM Header</h2>
                <slot name="item"></slot>
            </div>
        `;
    }

    connectedCallback() {
        // Hydration: The component mutates its Light DOM children
        // by adding a slot attribute so they project correctly.
        Array.from(this.children).forEach(child => {
            child.setAttribute('slot', 'item');
            child.classList.add('hydrated');
        });
    }
}
customElements.define('my-carousel', MyCarousel);