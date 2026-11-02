package com.circle;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Launcher screen: entry points to the two decisions under test. */
public class MainActivity extends Activity {
    public static final String EXTRA_VARIANT = "variant";
    public static final String EXTRA_FIXTURE = "fixture";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        StateServer.ensure(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, dp(64), pad, pad);

        TextView title = new TextView(this);
        title.setText("Circle");
        title.setTextSize(28);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Choose a decision to test.");
        sub.setPadding(0, dp(8), 0, dp(24));
        root.addView(sub);

        Button location = new Button(this);
        location.setText("Location settings");
        location.setContentDescription("nav.location");
        location.setOnClickListener(v -> start(LocationActivity.class));
        root.addView(location);

        Button plus = new Button(this);
        plus.setText("Circle+");
        plus.setContentDescription("nav.subscription");
        plus.setOnClickListener(v -> start(SubActivity.class));
        root.addView(plus);

        setContentView(root);
    }

    private void start(Class<? extends Activity> screen) {
        Intent intent = new Intent(this, screen);
        intent.putExtra(EXTRA_VARIANT, getIntent().getStringExtra(EXTRA_VARIANT));
        intent.putExtra(EXTRA_FIXTURE, getIntent().getStringExtra(EXTRA_FIXTURE));
        startActivity(intent);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
