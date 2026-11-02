package com.circle;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Circle+ subscription decision. Baseline shows Subscribe and Decline side by
 * side; the candidate hides Decline behind More options, mirroring the web
 * {@code SUB_HIDE_DECLINE} seed.
 */
public class SubActivity extends Activity {
    private State state;
    private boolean candidate;
    private LinearLayout offer;
    private LinearLayout declineOptions;
    private LinearLayout active;
    private TextView activeNote;
    private TextView termsNote;

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recreate();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        StateServer.ensure(this);
        state = new State(this);
        candidate = "candidate".equals(getIntent().getStringExtra(MainActivity.EXTRA_VARIANT));
        state.applyFixture(getIntent().getStringExtra(MainActivity.EXTRA_FIXTURE), "subscription");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, dp(64), pad, pad);

        offer = new LinearLayout(this);
        offer.setOrientation(LinearLayout.VERTICAL);
        offer.addView(heading("Try Circle+"));
        offer.addView(body("Circle+ Monthly \u00b7 $4.99, renews automatically. Cancel anytime in Settings."));
        offer.addView(primaryButton("Subscribe", "sub.subscribe", () -> {
            state.answerOffer(true);
            showActive();
        }));
        if (candidate) {
            offer.addView(linkButton("More options", "sub.more", () -> showDeclineOptions()));
        } else {
            offer.addView(linkButton("Not now", "sub.decline", () -> state.answerOffer(false)));
        }
        offer.addView(linkButton("Renewal terms", "sub.terms", () -> {
            state.viewTerms();
            termsNote.setVisibility(View.VISIBLE);
        }));
        termsNote = body("Circle+ Monthly \u00b7 $4.99. Your plan renews automatically each "
                + "month until you cancel. Cancel anytime in Settings \u00b7 Billing; "
                + "you keep Circle+ until the end of the paid period.");
        termsNote.setVisibility(View.GONE);
        offer.addView(termsNote);
        root.addView(offer);

        declineOptions = new LinearLayout(this);
        declineOptions.setOrientation(LinearLayout.VERTICAL);
        declineOptions.setVisibility(View.GONE);
        declineOptions.addView(body("No problem. Circle stays free, and you can join Circle+ anytime."));
        declineOptions.addView(linkButton("Not now", "sub.decline", () -> state.answerOffer(false)));
        root.addView(declineOptions);

        active = new LinearLayout(this);
        active.setOrientation(LinearLayout.VERTICAL);
        active.setVisibility(View.GONE);
        activeNote = body("Circle+ \u00b7 Monthly \u00b7 $4.99 \u00b7 active");
        active.addView(activeNote);
        active.addView(linkButton("Cancel subscription", "sub.cancel", () -> {
            state.setSubActive(false);
            showOffer();
        }));
        root.addView(active);

        setContentView(root);
        if (state.subActive()) showActive();
        else showOffer();
    }

    private void showOffer() {
        offer.setVisibility(View.VISIBLE);
        declineOptions.setVisibility(View.GONE);
        active.setVisibility(View.GONE);
    }

    private void showDeclineOptions() {
        offer.setVisibility(View.GONE);
        declineOptions.setVisibility(View.VISIBLE);
        active.setVisibility(View.GONE);
    }

    private void showActive() {
        offer.setVisibility(View.GONE);
        declineOptions.setVisibility(View.GONE);
        active.setVisibility(View.VISIBLE);
    }

    private TextView heading(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(22);
        view.setPadding(0, dp(8), 0, dp(8));
        return view;
    }

    private TextView body(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(16);
        view.setPadding(0, 0, 0, dp(16));
        return view;
    }

    private Button primaryButton(String text, String tag, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setContentDescription(tag);
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private Button linkButton(String text, String tag, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setContentDescription(tag);
        button.setBackgroundColor(0x00000000);
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
