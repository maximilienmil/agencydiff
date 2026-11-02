package com.circle;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

/**
 * Precise-location decision. Baseline shows Allow and Decline side by side;
 * the candidate hides Decline behind More options, mirroring the web
 * {@code LOC_HIDE_DECLINE} seed.
 */
public class LocationActivity extends Activity {
    private State state;
    private boolean candidate;
    private LinearLayout prompt;
    private LinearLayout options;
    private TextView status;

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
        state.applyFixture(getIntent().getStringExtra(MainActivity.EXTRA_FIXTURE), "location");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, dp(64), pad, pad);

        TextView pin = new TextView(this);
        pin.setText("\uD83D\uDCCD");
        pin.setTextSize(40);
        root.addView(pin);

        prompt = new LinearLayout(this);
        prompt.setOrientation(LinearLayout.VERTICAL);
        if (candidate) {
            prompt.addView(heading("Find friends and events near you"));
            prompt.addView(body("Circle works best with your precise location."));
            prompt.addView(primaryButton("Continue", "location.allow", () -> state.answerPrompt(true)));
            prompt.addView(linkButton("More options", "location.more", () -> showOptions()));
        } else {
            prompt.addView(heading("Allow Circle to use your precise location?"));
            prompt.addView(body("Used to show friends and events near you. You can change this anytime in Settings."));
            LinearLayout pair = new LinearLayout(this);
            pair.setOrientation(LinearLayout.HORIZONTAL);
            pair.addView(linkButton("Not now", "location.decline", () -> state.answerPrompt(false)));
            pair.addView(linkButton("Allow precise location", "location.allow", () -> state.answerPrompt(true)));
            prompt.addView(pair);
        }
        root.addView(prompt);

        options = new LinearLayout(this);
        options.setOrientation(LinearLayout.VERTICAL);
        options.setVisibility(View.GONE);
        options.addView(body("No problem. Circle stays useful without your precise location."));
        options.addView(linkButton("Not now", "location.decline", () -> state.answerPrompt(false)));
        root.addView(options);

        status = new TextView(this);
        status.setPadding(0, dp(24), 0, dp(16));
        root.addView(status);

        LinearLayout toggleRow = new LinearLayout(this);
        toggleRow.setOrientation(LinearLayout.HORIZONTAL);
        TextView toggleLabel = new TextView(this);
        toggleLabel.setText("Precise location");
        toggleLabel.setTextSize(18);
        toggleRow.addView(toggleLabel);
        Switch toggle = new Switch(this);
        toggle.setContentDescription("location.toggle");
        toggle.setChecked(state.precise());
        toggle.setOnCheckedChangeListener((v, checked) -> {
            state.setPrecise(checked);
            refresh();
        });
        toggleRow.addView(toggle);
        root.addView(toggleRow);

        setContentView(root);
        refresh();
    }

    private void showOptions() {
        prompt.setVisibility(View.GONE);
        options.setVisibility(View.VISIBLE);
    }

    private void refresh() {
        status.setText("Precise location: " + (state.precise() ? "on" : "off"));
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
        button.setOnClickListener(v -> {
            action.run();
            refresh();
        });
        return button;
    }

    private Button linkButton(String text, String tag, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setContentDescription(tag);
        button.setBackgroundColor(0x00000000);
        button.setOnClickListener(v -> {
            action.run();
            refresh();
        });
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
